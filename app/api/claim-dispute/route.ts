import { NextRequest, NextResponse } from 'next/server'
import { executeWithGeminiFallback } from '@/lib/ai/extractor'
import { validateEvidence } from '@/lib/pdf/extractor'
import { formatPageForPrompt, OCR_PROMPT_RULES } from '@/lib/pdf/promptFormat'
import { hasOcrPages } from '@/lib/ai/extractor'
import type { DisputeAnalysis, ExtractedPage, Citation } from '@/lib/types/policy'

export const maxDuration = 120

function buildDisputeSystemPrompt(): string {
  return `You are PolicyLens Dispute Advisor — an expert insurance claim dispute analyst specializing in Indian health insurance.

Your job: Given a policyholder's insurance policy document and the insurance company's reason(s) for rejecting a claim, you must analyze whether the rejection is valid or whether there are legitimate grounds to dispute it.

CRITICAL RULES:
1. Be HONEST. If the rejection is justified by the policy terms, say so clearly. Do NOT fabricate arguments.
2. Every counter-argument MUST be backed by a direct citation from the policy document with page number and an exact or very close quote.
3. Never invent page numbers, sections, or quotes.
4. Consider IRDAI (Insurance Regulatory and Development Authority of India) regulations and consumer protection principles where applicable.
5. For each rejection reason, assess argument strength:
   - 'strong': Clear policy clause directly contradicts the rejection
   - 'moderate': Policy is ambiguous or the rejection may be a misinterpretation
   - 'weak': Limited evidence in the policy, but some grounds exist

Return a valid JSON object with EXACTLY this structure:
{
  "verdict": "disputable|partially_disputable|not_disputable",
  "verdict_summary": "A 2-3 sentence summary of whether the claim can be disputed and why",
  "arguments": [
    {
      "rejection_reason": "The specific rejection reason being addressed",
      "counter_argument": "Detailed counter-argument explaining why this rejection may be invalid, referencing specific policy clauses",
      "supporting_clauses": [
        {
          "page_number": 12,
          "section_name": "Section name from the policy",
          "evidence_text": "Direct verbatim quote from the policy document"
        }
      ],
      "strength": "strong|moderate|weak",
      "legal_basis": "Optional: relevant IRDAI regulation, Insurance Act section, or ombudsman precedent"
    }
  ],
  "recommended_actions": [
    "Step-by-step actions the policyholder should take to dispute the claim"
  ],
  "overall_confidence": "high|medium|low",
  "disclaimer": "A brief legal disclaimer that this is AI-generated analysis and not legal advice"
}

Respond with ONLY valid JSON. No markdown, no explanation.`
}

function buildDisputeUserPrompt(
  rejectionReasons: string[],
  pages: ExtractedPage[],
  treatmentName?: string,
  claimAmount?: string,
  rejectionLetterText?: string,
): string {
  let totalChars = 0
  const maxChars = 55000
  const pageChunks: string[] = []

  for (const page of pages) {
    if (totalChars >= maxChars) break
    const remaining = maxChars - totalChars
    const text = page.text.slice(0, remaining)
    totalChars += text.length
    if (text.trim().length > 0) {
      pageChunks.push(formatPageForPrompt(page, text))
    }
  }

  let prompt = `CLAIM REJECTION DETAILS:\n`

  if (treatmentName) prompt += `Treatment/Procedure: ${treatmentName}\n`
  if (claimAmount) prompt += `Claim Amount: ${claimAmount}\n`

  prompt += `\nREJECTION REASONS GIVEN BY INSURANCE COMPANY:\n`
  rejectionReasons.forEach((reason, i) => {
    prompt += `${i + 1}. ${reason}\n`
  })

  if (rejectionLetterText) {
    prompt += `\nFULL REJECTION LETTER TEXT:\n${rejectionLetterText.slice(0, 3000)}\n`
  }

  prompt += `\nPOLICY DOCUMENT TEXT:\n\n${pageChunks.join('\n\n---\n\n')}`

  return prompt
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      rejection_reasons,
      treatment_name,
      claim_amount,
      rejection_letter_text,
      pages,
    } = body

    if (!rejection_reasons || !Array.isArray(rejection_reasons) || rejection_reasons.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one rejection reason is required.' },
        { status: 400 },
      )
    }

    if (!pages || !Array.isArray(pages) || pages.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Policy document pages are required. Please upload and analyze a policy first.' },
        { status: 400 },
      )
    }

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'GOOGLE_GENERATIVE_AI_API_KEY is not configured.' },
        { status: 500 },
      )
    }

    const systemPrompt =
      buildDisputeSystemPrompt() + (hasOcrPages(pages) ? `\n${OCR_PROMPT_RULES}` : '')
    const userPrompt = buildDisputeUserPrompt(
      rejection_reasons,
      pages,
      treatment_name,
      claim_amount,
      rejection_letter_text,
    )

    const rawJsonText = await executeWithGeminiFallback(
      apiKey,
      (model) =>
        fetch(
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
                temperature: 0.15,
                maxOutputTokens: 4096,
                responseMimeType: 'application/json',
              },
            }),
          },
        ),
      async (response) => {
        const json = await response.json()
        return json.candidates?.[0]?.content?.parts?.[0]?.text || ''
      },
    )

    if (!rawJsonText) {
      throw new Error('Empty response from Gemini API')
    }

    const cleaned = rawJsonText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
    const analysis: DisputeAnalysis = JSON.parse(cleaned)

    // Post-validation: verify citations against page text
    const pageMap = new Map<number, string>()
    for (const p of pages) {
      pageMap.set(p.page_number, p.text)
    }

    for (const arg of analysis.arguments) {
      const validClauses: Citation[] = []
      for (const clause of arg.supporting_clauses || []) {
        if (clause.page_number && clause.evidence_text) {
          const pageText = pageMap.get(clause.page_number) ?? ''
          const isValid = validateEvidence(clause.evidence_text, pageText)
          if (isValid) {
            validClauses.push(clause)
          }
        }
      }
      arg.supporting_clauses = validClauses

      // Downgrade strength if no valid citations remain
      if (validClauses.length === 0 && arg.strength === 'strong') {
        arg.strength = 'moderate'
      }
    }

    return NextResponse.json({
      success: true,
      data: analysis,
    })
  } catch (err: any) {
    console.error('[claim-dispute]', err)
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to analyze claim dispute.' },
      { status: 500 },
    )
  }
}
