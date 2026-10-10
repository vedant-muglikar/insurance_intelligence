/**
 * BimaSetu - Conversational Policy Q&A Engine (Blueprint Section 11 & 12)
 * Features:
 * - Multi-turn conversational memory (passes prior user/assistant turns)
 * - Dual AI provider: Google Gemini with dynamic fallback to OpenAI GPT-4o
 * - Citation validation: verifies policy quotes against actual page text
 * - Scenario context injection: answers incorporate patient/treatment context
 */

import { ExtractedPage, Citation, AskResponseData, PolicyRule } from '@/lib/types/policy'
import { executeWithGeminiFallback, getAvailableGeminiModels } from './extractor'
import { validateEvidence } from '../pdf/extractor'
import { formatPageForPrompt, OCR_PROMPT_RULES } from '../pdf/promptFormat'
import { hasOcrPages } from './extractor'

function buildAskSystemPrompt(scenarioContext?: string, spoken = false): string {
  let prompt = `You are BimaSetu, an expert insurance policy intelligence engine. Your task is to answer user inquiries accurately and strictly based on the provided policy wording.

CRITICAL INSTRUCTIONS:
1. Ground every statement about this policy in the provided policy text.
2. Never invent clauses, limits, or page numbers.
3. Every claim must have an exact citation with the actual page number and a verbatim (or very close) quote in 'evidence_text'.
4. Determine the 'status' strictly from the policy terms:
   - 'covered': clearly covered without prohibitive conditions
   - 'conditionally_covered': covered subject to waiting periods, co-pay, pre-auth, or sub-limits
   - 'not_covered': explicitly excluded or inadmissible
   - 'unclear': not specified or ambiguous in the document
5. Set 'confidence' to 'high', 'medium', or 'low'.

WHEN THE POLICY DOES NOT ANSWER (silent, ambiguous, or the question is outside the document):
- Reply like a warm, knowledgeable human advisor, never like a form letter. Never answer with a bare refusal, and never reuse the same stock sentence from turn to turn.
- Say plainly what the document does and does not say about it. If something nearby is relevant (a related clause, a general exclusion, a sub-limit), mention it and cite it.
- Say what that probably means for the person in practical terms, without inventing any term, number or page.
- Give one concrete next step that fits the question: ask the insurer or TPA helpline, check the policy schedule or endorsements, or ask the hospital's insurance desk to confirm before admission.
- If the question is too vague to answer, ask ONE short clarifying question instead.
- Use status "unclear" and leave citations empty unless you cite a related clause.
- Greetings, thanks and small talk: answer naturally and briefly. Questions unrelated to insurance: say kindly that you can only help with this policy, and offer an example of what you can answer.
- Vary your wording. Keep it under 80 words.`

  if (scenarioContext) {
    prompt += `\n\nCURRENT USER SCENARIO CONTEXT:\n${scenarioContext}\nFactor this scenario into your answer when answering scenario-dependent questions.`
  }

  if (spoken) {
    prompt += `\n\nSPOKEN MODE: the "answer" is read aloud to the user. Keep it under 45 words in short plain sentences. No markdown, lists, brackets or symbols. Say amounts like "5 lakh rupees". Put the "answer" key FIRST in the JSON.`
  }

  prompt += `\n\nReturn ONLY a valid JSON object matching this schema:
{
  "answer": "Clear, concise explanation with relevant policy stipulations.",
  "status": "covered|conditionally_covered|not_covered|unclear",
  "citations": [
    {
      "page_number": 12,
      "section_name": "Section or Clause name from document",
      "evidence_text": "Direct quote from policy text"
    }
  ],
  "confidence": "high|medium|low"
}`

  return prompt
}

const STOP_WORDS = new Set(
  'the and for are was were what which with this that have has does did from into about can could would should will you your any all not but how why when where who whom its it is of to in on at by be as an or if do my me i we our they them their there than then also may might must shall under per out over'.split(' '),
)

function keywordsOf(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((w) => !STOP_WORDS.has(w))
}

/** Picks the pages most relevant to the question so the prompt stays small and the model answers faster. */
export function selectRelevantPages(pages: ExtractedPage[], query: string, budget = 30000): ExtractedPage[] {
  const kws = [...new Set(keywordsOf(query))]
  const scored = pages
    .filter((p) => p.text.trim().length > 0)
    .map((p) => {
      const t = p.text.toLowerCase()
      let score = 0
      for (const k of kws) score += Math.min(t.split(k).length - 1, 5)
      return { p, score }
    })

  const ranked = scored.some((x) => x.score > 0) ? [...scored].sort((x, y) => y.score - x.score).filter((x) => x.score > 0) : scored
  const chosen: ExtractedPage[] = []
  let used = 0
  for (const { p } of ranked) {
    if (used >= budget) break
    const room = budget - used
    chosen.push(room >= p.text.length ? p : { ...p, text: p.text.slice(0, room) })
    used += Math.min(room, p.text.length)
  }
  return chosen.sort((x, y) => x.page_number - y.page_number)
}

function ruleIndex(rules?: PolicyRule[]): string {
  if (!rules?.length) return ''
  let out = ''
  for (const r of rules.slice(0, 60)) {
    const line = `- [${r.category}] ${r.rule_name}: ${r.value} (${r.status}${r.page_number ? `, p.${r.page_number}` : ''})\n`
    if (out.length + line.length > 5000) break
    out += line
  }
  return `\n\nEXTRACTED RULE INDEX (a convenience summary; cite the policy text pages below, not this list):\n${out}`
}

function buildAskUserPrompt(
  question: string,
  pages: ExtractedPage[],
  history?: Array<{ role: 'user' | 'assistant'; content: string }>,
  rules?: PolicyRule[],
): string {
  // Short follow-ups ("what about dental?") borrow keywords from the previous user turn.
  const lastUser = [...(history ?? [])].reverse().find((m) => m.role === 'user')?.content ?? ''
  const query = question.split(/\s+/).length < 6 ? `${question} ${lastUser}` : question
  const pageChunks = selectRelevantPages(pages, query).map((p) => formatPageForPrompt(p, p.text))

  let conversationHistoryText = ''
  if (history && history.length > 0) {
    const recent = history.slice(-6) // Last 6 messages
    conversationHistoryText = `\n\nRECENT CHAT HISTORY:\n${recent
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n')}`
  }

  return `${conversationHistoryText}${ruleIndex(rules)}\n\nUSER QUESTION: "${question}"\n\nPOLICY DOCUMENT TEXT (most relevant pages):\n\n${pageChunks.join('\n\n---\n\n')}`
}

export async function askPolicyQuestion(
  question: string,
  pages: ExtractedPage[],
  history?: Array<{ role: 'user' | 'assistant'; content: string }>,
  scenarioContext?: string,
  rules?: PolicyRule[],
): Promise<AskResponseData> {
  const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY

  if (!googleApiKey) {
    throw new Error('No AI API key found. Set GOOGLE_GENERATIVE_AI_API_KEY.')
  }

  const systemPrompt =
    buildAskSystemPrompt(scenarioContext) + (hasOcrPages(pages) ? `\n${OCR_PROMPT_RULES}` : '')
  const userPrompt = buildAskUserPrompt(question, pages, history, rules)

  let rawJsonText = ''

  // ─── Provider: Google Gemini ─────────────────────────────────────────────
  if (googleApiKey) {
    try {
      rawJsonText = await executeWithGeminiFallback(
        googleApiKey,
        (model) => fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${googleApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  role: 'user',
                  parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
                },
              ],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 2048,
                responseMimeType: 'application/json',
              },
            }),
          }
        ),
        async (response) => {
          const json = await response.json()
          return json.candidates?.[0]?.content?.parts?.[0]?.text || ''
        }
      )
    } catch (geminiErr: any) {
      throw new Error(`Gemini AI failed for Q&A: ${geminiErr?.message}`)
    }
  }

  if (!rawJsonText) {
    throw new Error('Failed to generate response from Gemini API.')
  }

  return finalizeAsk(rawJsonText, pages)
}

export function finalizeAsk(rawJsonText: string, pages: ExtractedPage[]): AskResponseData {
  const cleaned = rawJsonText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
  const rawData = JSON.parse(cleaned) as AskResponseData

  // ─── Post-Validation: Verify citations against actual extracted page text ──
  const pageMap = new Map<number, string>()
  for (const p of pages) {
    pageMap.set(p.page_number, p.text)
  }

  let finalConfidence = rawData.confidence
  const validCitations: Citation[] = []

  for (const cit of rawData.citations || []) {
    if (cit.page_number && cit.evidence_text) {
      const pageText = pageMap.get(cit.page_number) ?? ''
      const isValid = validateEvidence(cit.evidence_text, pageText)
      if (isValid) {
        validCitations.push(cit)
      } else {
        // Downgrade confidence if cited quote doesn't exist on page
        finalConfidence = 'low'
      }
    }
  }

  return {
    answer: rawData.answer,
    status: rawData.status || 'unclear',
    citations: validCitations,
    confidence: finalConfidence,
  }
}

// ─── Streaming (voice) ───────────────────────────────────────────────────────

/** Pulls the "answer" string out of partial JSON as it arrives, returning only the new decoded characters. */
function makeAnswerExtractor() {
  let buf = ''
  let pos = -1
  let done = false
  let esc = false
  return (chunk: string): string => {
    buf += chunk
    if (pos < 0) {
      const m = /"answer"\s*:\s*"/.exec(buf)
      if (!m) return ''
      pos = m.index + m[0].length
    }
    let out = ''
    while (!done && pos < buf.length) {
      const c = buf[pos]
      if (esc) {
        if (c === 'u') {
          if (pos + 4 >= buf.length) break
          out += String.fromCharCode(parseInt(buf.slice(pos + 1, pos + 5), 16))
          pos += 5
          esc = false
          continue
        }
        esc = false
        out += c === 'n' ? '\n' : c === 't' ? ' ' : c
        pos++
        continue
      }
      if (c === '\\') {
        esc = true
        pos++
        continue
      }
      if (c === '"') {
        done = true
        break
      }
      out += c
      pos++
    }
    return out
  }
}

/** Streams the answer text through onAnswerText as Gemini generates it, then returns the validated result. */
export async function streamPolicyAnswer(
  opts: {
    question: string
    pages: ExtractedPage[]
    history?: Array<{ role: 'user' | 'assistant'; content: string }>
    scenarioContext?: string
    spoken?: boolean
    rules?: PolicyRule[]
  },
  onAnswerText: (text: string) => void,
): Promise<AskResponseData> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!apiKey) throw new Error('No AI API key found. Set GOOGLE_GENERATIVE_AI_API_KEY.')

  const prompt = `${buildAskSystemPrompt(opts.scenarioContext, opts.spoken)}\n\n${buildAskUserPrompt(opts.question, opts.pages, opts.history, opts.rules)}`
  const models = await getAvailableGeminiModels(apiKey)
  let lastError: unknown

  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.25,
              maxOutputTokens: opts.spoken ? 700 : 2048,
              responseMimeType: 'application/json',
            },
          }),
        },
      )
      if (!res.ok || !res.body) throw new Error(`Status ${res.status}: ${await res.text()}`)

      const extract = makeAnswerExtractor()
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let sse = ''
      let full = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        sse += dec.decode(value, { stream: true })
        let nl: number
        while ((nl = sse.indexOf('\n')) >= 0) {
          const line = sse.slice(0, nl).trim()
          sse = sse.slice(nl + 1)
          if (!line.startsWith('data:')) continue
          try {
            const j = JSON.parse(line.slice(5).trim())
            const text: string = (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('')
            if (!text) continue
            full += text
            const fresh = extract(text)
            if (fresh) onAnswerText(fresh)
          } catch {
            /* partial or non-JSON keep-alive line */
          }
        }
      }
      if (!full) throw new Error('Empty response from Gemini')
      return finalizeAsk(full, opts.pages)
    } catch (err) {
      lastError = err
      console.warn(`[Gemini stream] ${model} failed: ${(err as Error).message}`)
    }
  }
  throw new Error(`All Gemini models failed. Last error: ${(lastError as Error)?.message}`)
}
