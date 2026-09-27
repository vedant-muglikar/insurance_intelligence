import type {
  ExtractedPage,
  PolicyOverview,
  PolicyRule,
  PolicyStatus,
  PolicyCategory,
} from '@/lib/types/policy'
import { validateEvidence } from '@/lib/pdf/extractor'

// ─── Prompt building ─────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are an expert insurance policy analyst. Your task is to extract structured information from an insurance policy document.

You will be given page-by-page text from a PDF. Extract every meaningful rule, coverage, exclusion, limit, waiting period, deductible, co-payment, sub-limit, eligibility condition, and claim requirement.

CRITICAL RULES:
1. Only reference page numbers that actually contain the information you are citing.
2. evidence_text MUST be a direct quote or very close paraphrase of actual text from the referenced page.
3. Never invent page numbers, sections, or evidence.
4. If you are unsure about something, use status "unclear" and confidence "low".
5. Be exhaustive — extract every significant policy rule you can find.

Return a valid JSON object with exactly this structure:
{
  "overview": {
    "insurer": "string",
    "plan_name": "string",
    "sum_insured": "string",
    "policy_type": "string"
  },
  "rules": [
    {
      "category": "coverage|exclusion|waiting_period|deductible|co_payment|room_rent|icu_limit|sub_limit|eligibility|claim_requirement|sum_insured|general",
      "rule_name": "short rule name",
      "value": "the key value (e.g. '₹5,00,000' or '30 days' or 'Not covered')",
      "description": "clear human-readable explanation",
      "status": "covered|conditionally_covered|not_covered|unclear",
      "conditions": ["array of conditions or empty array"],
      "page_number": 12,
      "section_name": "Section name from document",
      "evidence_text": "Direct quote from the policy document that supports this rule",
      "confidence": "high|medium|low"
    }
  ]
}

Respond with ONLY valid JSON. No markdown, no explanation.`
}

function buildUserPrompt(pages: ExtractedPage[]): string {
  // Limit total text to ~60k characters to stay within context
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

  return `Here is the insurance policy document text, organized by page:\n\n${pageChunks.join('\n\n---\n\n')}`
}

// ─── AI call ─────────────────────────────────────────────────────────────────

interface AIRawResult {
  overview: PolicyOverview
  rules: Array<{
    category: PolicyCategory
    rule_name: string
    value: string
    description: string
    status: PolicyStatus
    conditions: string[]
    page_number: number | null
    section_name: string
    evidence_text: string
    confidence: 'high' | 'medium' | 'low'
  }>
}

export async function extractPolicyWithAI(
  pages: ExtractedPage[],
): Promise<AIRawResult> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY

  if (!apiKey) {
    throw new Error(
      'No AI API key found. Set OPENAI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY in your .env.local file.',
    )
  }

  // Prefer Google if Google key is set
  const useGoogle = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY

  if (useGoogle) {
    return callGemini(pages)
  }
  return callOpenAI(pages)
}

// ─── OpenAI ──────────────────────────────────────────────────────────────────

async function callOpenAI(pages: ExtractedPage[]): Promise<AIRawResult> {
  const apiKey = process.env.OPENAI_API_KEY!

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      temperature: 0.1,
      max_tokens: 8000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: buildUserPrompt(pages) },
      ],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`OpenAI API error: ${response.status} — ${err}`)
  }

  const json = await response.json()
  const content = json.choices?.[0]?.message?.content
  if (!content) throw new Error('Empty response from OpenAI')
  return JSON.parse(content) as AIRawResult
}

// ─── Gemini ──────────────────────────────────────────────────────────────────

let cachedGeminiModel: string | null = null

let modelBlacklist = new Set<string>()

export async function getBestGeminiModel(apiKey: string): Promise<string> {
  if (cachedGeminiModel && !modelBlacklist.has(cachedGeminiModel)) {
    return cachedGeminiModel
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    )
    if (!response.ok) throw new Error('Failed to fetch models')
    
    const data = await response.json()
    const models = data.models || []
    
    // Filter for models supporting generateContent and not in blacklist
    const available = models
      .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m: any) => m.name.replace('models/', ''))
      .filter((m: string) => !modelBlacklist.has(m))

    // Prioritize flash models, then pro, sorting to get highest version
    const flashModels = available.filter((m: string) => m.includes('flash')).sort((a: string, b: string) => b.localeCompare(a))
    const proModels = available.filter((m: string) => m.includes('pro')).sort((a: string, b: string) => b.localeCompare(a))

    const selectedModel = flashModels[0] || proModels[0] || available[0] || 'gemini-1.5-flash'
    
    cachedGeminiModel = selectedModel
    console.log(`[Gemini] Selected model dynamically: ${cachedGeminiModel}`)
    return selectedModel
  } catch (err) {
    console.warn('[Gemini] Could not dynamically fetch models, falling back to gemini-1.5-flash', err)
    return 'gemini-1.5-flash'
  }
}

async function callGemini(pages: ExtractedPage[], retryCount = 0): Promise<AIRawResult> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY!
  const model = await getBestGeminiModel(apiKey)

  const systemPrompt = buildSystemPrompt()
  const userPrompt = buildUserPrompt(pages)

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
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        },
      }),
    },
  )

  if (!response.ok) {
    const err = await response.text()
    
    // If model is not found (404) or we hit a hard 0-quota limit (429), blacklist it and try the next best model
    if ((response.status === 404 || (response.status === 429 && err.includes('limit: 0'))) && retryCount < 3) {
      console.warn(`[Gemini] Model ${model} is unavailable or has no free tier quota. Retrying with a different model...`)
      modelBlacklist.add(model)
      cachedGeminiModel = null
      return callGemini(pages, retryCount + 1)
    }
    
    throw new Error(`Gemini API error: ${response.status} — ${err}`)
  }

  const json = await response.json()
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Empty response from Gemini')

  // Strip possible markdown fences
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
  return JSON.parse(cleaned) as AIRawResult
}

// ─── Validation & enrichment ─────────────────────────────────────────────────

export function validateAndEnrichRules(
  rawRules: AIRawResult['rules'],
  pages: ExtractedPage[],
): PolicyRule[] {
  const pageMap = new Map<number, string>()
  for (const p of pages) {
    pageMap.set(p.page_number, p.text)
  }

  return rawRules.map((rule, idx) => {
    let evidenceValidated = false
    let confidence = rule.confidence

    if (rule.page_number !== null && rule.evidence_text) {
      const pageText = pageMap.get(rule.page_number) ?? ''
      evidenceValidated = validateEvidence(rule.evidence_text, pageText)

      // Downgrade confidence if evidence cannot be verified
      if (!evidenceValidated) {
        confidence = 'low'
      }
    }

    const finalStatus =
      !evidenceValidated && rule.page_number !== null
        ? // Only override to unclear if evidence is missing AND page was cited
          confidence === 'low' && rule.status !== 'not_covered'
          ? 'unclear'
          : rule.status
        : rule.status

    return {
      id: `rule-${idx}-${Date.now()}`,
      category: rule.category,
      rule_name: rule.rule_name,
      value: rule.value,
      description: rule.description,
      status: finalStatus,
      conditions: Array.isArray(rule.conditions) ? rule.conditions : [],
      page_number: rule.page_number,
      section_name: rule.section_name || 'General',
      evidence_text: rule.evidence_text || '',
      confidence,
      evidence_validated: evidenceValidated,
    } satisfies PolicyRule
  })
}
