/**
 * ClaimLens - Conversational Policy Q&A Engine (Blueprint Section 11 & 12)
 * Features:
 * - Multi-turn conversational memory (passes prior user/assistant turns)
 * - Dual AI provider: Google Gemini with dynamic fallback to OpenAI GPT-4o
 * - Citation validation: verifies policy quotes against actual page text
 * - Scenario context injection: answers incorporate patient/treatment context
 */

import { ExtractedPage, Citation, AskResponseData } from '@/lib/types/policy'
import { getBestGeminiModel } from './extractor'
import { validateEvidence } from '../pdf/extractor'

function buildAskSystemPrompt(scenarioContext?: string): string {
  let prompt = `You are ClaimLens, an expert insurance policy intelligence engine. Your task is to answer user inquiries accurately and strictly based on the provided policy wording.

CRITICAL INSTRUCTIONS:
1. Answer ONLY from the provided policy text. If the policy does not state or clarify the answer, clearly state "I cannot determine this from the provided policy document."
2. Never invent clauses, limits, or page numbers.
3. Every claim must have an exact citation with the actual page number and a verbatim (or very close) quote in 'evidence_text'.
4. Determine the 'status' strictly from the policy terms:
   - 'covered': clearly covered without prohibitive conditions
   - 'conditionally_covered': covered subject to waiting periods, co-pay, pre-auth, or sub-limits
   - 'not_covered': explicitly excluded or inadmissible
   - 'unclear': not specified or ambiguous in the document
5. Set 'confidence' to 'high', 'medium', or 'low'.`

  if (scenarioContext) {
    prompt += `\n\nCURRENT USER SCENARIO CONTEXT:\n${scenarioContext}\nFactor this scenario into your answer when answering scenario-dependent questions.`
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

function buildAskUserPrompt(
  question: string,
  pages: ExtractedPage[],
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
): string {
  // Compress pages to stay within context limit (~60,000 chars)
  let totalChars = 0
  const maxChars = 55000
  const pageChunks: string[] = []

  for (const page of pages) {
    if (totalChars >= maxChars) break
    const remaining = maxChars - totalChars
    const text = page.text.slice(0, remaining)
    totalChars += text.length
    if (text.trim().length > 0) {
      pageChunks.push(`[PAGE ${page.page_number}]\n${text}`)
    }
  }

  let conversationHistoryText = ''
  if (history && history.length > 0) {
    const recent = history.slice(-6) // Last 6 messages
    conversationHistoryText = `\n\nRECENT CHAT HISTORY:\n${recent
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n')}`
  }

  return `${conversationHistoryText}\n\nUSER QUESTION: "${question}"\n\nPOLICY DOCUMENT TEXT:\n\n${pageChunks.join('\n\n---\n\n')}`
}

export async function askPolicyQuestion(
  question: string,
  pages: ExtractedPage[],
  history?: Array<{ role: 'user' | 'assistant'; content: string }>,
  scenarioContext?: string
): Promise<AskResponseData> {
  const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  const openAiApiKey = process.env.OPENAI_API_KEY

  if (!googleApiKey && !openAiApiKey) {
    throw new Error('No AI API key found. Set GOOGLE_GENERATIVE_AI_API_KEY or OPENAI_API_KEY.')
  }

  const systemPrompt = buildAskSystemPrompt(scenarioContext)
  const userPrompt = buildAskUserPrompt(question, pages, history)

  let rawJsonText = ''

  // ─── Provider 1: Google Gemini ─────────────────────────────────────────────
  if (googleApiKey) {
    try {
      const model = await getBestGeminiModel(googleApiKey)
      const response = await fetch(
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
      )

      if (response.ok) {
        const json = await response.json()
        rawJsonText = json.candidates?.[0]?.content?.parts?.[0]?.text || ''
      } else {
        console.warn(`Gemini Q&A failed with status ${response.status}; checking OpenAI fallback...`)
      }
    } catch (geminiErr: any) {
      console.warn('Gemini Q&A exception:', geminiErr?.message)
    }
  }

  // ─── Provider 2: OpenAI GPT-4o Fallback ───────────────────────────────────
  if (!rawJsonText && openAiApiKey) {
    try {
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt },
      ]

      if (history && history.length > 0) {
        for (const h of history.slice(-4)) {
          messages.push({ role: h.role, content: h.content })
        }
      }

      messages.push({ role: 'user', content: userPrompt })

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openAiApiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages,
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
      })

      if (response.ok) {
        const json = await response.json()
        rawJsonText = json.choices?.[0]?.message?.content || ''
      } else {
        const errText = await response.text()
        throw new Error(`OpenAI error: ${response.status} — ${errText}`)
      }
    } catch (openAiErr: any) {
      throw new Error(`AI providers failed for Q&A: ${openAiErr.message}`)
    }
  }

  if (!rawJsonText) {
    throw new Error('Failed to generate response from AI providers.')
  }

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
