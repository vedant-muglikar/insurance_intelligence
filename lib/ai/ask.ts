import { ExtractedPage, PolicyStatus, Citation, AskResponseData } from '@/lib/types/policy'
import { getBestGeminiModel } from './extractor'
import { validateEvidence } from '../pdf/extractor'

function buildAskSystemPrompt(): string {
  return `You are an expert insurance policy analyst. Your task is to answer the user's specific question based strictly on the provided insurance policy document.

CRITICAL RULES:
1. Answer ONLY from the provided policy text. If the answer cannot be determined, state "I cannot determine this from the provided policy."
2. Provide a clear, concise 'answer'.
3. Set the 'status' based on the policy rules regarding the user's question (covered, conditionally_covered, not_covered, unclear).
4. Provide precise citations. 'page_number' must be an integer reflecting where you found the info. 'evidence_text' must be a direct quote or close paraphrase.
5. Never invent page numbers, sections, or evidence.
6. Set confidence to high, medium, or low.

Return a valid JSON object with exactly this structure:
{
  "answer": "Clear explanation answering the question.",
  "status": "covered|conditionally_covered|not_covered|unclear",
  "citations": [
    {
      "page_number": 12,
      "section_name": "Section name from document",
      "evidence_text": "Direct quote supporting the answer"
    }
  ],
  "confidence": "high|medium|low"
}

Respond with ONLY valid JSON.`
}

function buildAskUserPrompt(question: string, pages: ExtractedPage[]): string {
  // Limit total text to ~60k characters
  let totalChars = 0
  const maxChars = 60000
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

  return `User Question: "${question}"\n\nPolicy Document:\n\n${pageChunks.join('\n\n---\n\n')}`
}

export async function askPolicyQuestion(
  question: string,
  pages: ExtractedPage[],
): Promise<AskResponseData> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY!
  if (!apiKey) {
    throw new Error('No Google Gemini API key found.')
  }
  const model = await getBestGeminiModel(apiKey)

  const systemPrompt = buildAskSystemPrompt()
  const userPrompt = buildAskUserPrompt(question, pages)

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
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
    },
  )

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Gemini API error: ${response.status} — ${err}`)
  }

  const json = await response.json()
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Empty response from Gemini')

  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
  const rawData = JSON.parse(cleaned) as AskResponseData

  // Validate citations
  const pageMap = new Map<number, string>()
  for (const p of pages) {
    pageMap.set(p.page_number, p.text)
  }

  let finalConfidence = rawData.confidence
  const validCitations: Citation[] = []

  for (const cit of (rawData.citations || [])) {
    if (cit.page_number && cit.evidence_text) {
      const pageText = pageMap.get(cit.page_number) ?? ''
      const isValid = validateEvidence(cit.evidence_text, pageText)
      if (isValid) {
        validCitations.push(cit)
      } else {
        finalConfidence = 'low'
      }
    }
  }

  return {
    ...rawData,
    citations: validCitations,
    confidence: finalConfidence,
  }
}
