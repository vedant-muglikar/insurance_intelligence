import { NextRequest, NextResponse } from 'next/server'
import { extractPdfPages, detectScannedPdf } from '@/lib/pdf/extractor'
import { extractPolicyWithAI, validateAndEnrichRules } from '@/lib/ai/extractor'
import { compilePolicyRules } from '@/lib/policy/compiler'
import { extractUin, documentHash } from '@/lib/policy/identity'
import { resolveSumInsured } from '@/lib/policy/sumInsured'
import { findSavedAnalysis, saveAnalysis } from '@/lib/policy/store'
import { formatINR } from '@/lib/policy/normalizers'
import type { PolicyAnalysisResult, PolicyRule } from '@/lib/types/policy'

function statsFor(rules: PolicyRule[]): PolicyAnalysisResult['extraction_stats'] {
  const n = (f: (r: PolicyRule) => boolean) => rules.filter(f).length
  return {
    total_rules: rules.length,
    coverage_count: n((r) => r.category === 'coverage'),
    exclusion_count: n((r) => r.category === 'exclusion'),
    waiting_period_count: n((r) => r.category === 'waiting_period'),
    limit_count: n((r) => ['room_rent', 'icu_limit', 'sub_limit', 'deductible', 'co_payment'].includes(r.category)),
    eligibility_count: n((r) => r.category === 'eligibility'),
    claim_requirement_count: n((r) => r.category === 'claim_requirement'),
    high_confidence: n((r) => r.confidence === 'high'),
    medium_confidence: n((r) => r.confidence === 'medium'),
    low_confidence: n((r) => r.confidence === 'low'),
    validated_count: n((r) => r.evidence_validated),
  }
}

export const maxDuration = 120 // seconds — allow long AI calls

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    // ── 1. Read multipart form data ─────────────────────────────────────────
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided.' },
        { status: 400 },
      )
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json(
        { success: false, error: 'Only PDF files are supported.' },
        { status: 400 },
      )
    }

    const maxSizeMB = 100
    if (file.size > maxSizeMB * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: `File exceeds ${maxSizeMB} MB limit.` },
        { status: 400 },
      )
    }

    // ── 2. Extract PDF text page-by-page ───────────────────────────────────
    const arrayBuffer = await file.arrayBuffer()
    const pages = await extractPdfPages(arrayBuffer)

    if (pages.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Could not extract any pages from this PDF.' },
        { status: 422 },
      )
    }

    const scannedPdfWarning = detectScannedPdf(pages)
    const totalPages = pages.length

    // ── 3. Identify the document: UIN (includes the product version) and a text hash ─────────
    const uinInfo = extractUin(pages)
    const hash = documentHash(pages)

    // ── 4. Reuse a saved analysis of this exact policy wording, if there is one ──────────────
    const saved = await findSavedAnalysis({ uin: uinInfo.uin, hash, pages: pages })
    if (saved) {
      const result: PolicyAnalysisResult = {
        overview: { ...saved.overview, total_pages: totalPages },
        rules: saved.rules,
        compiled_rules: saved.compiledRules.length ? saved.compiledRules : compilePolicyRules(saved.rules, saved.pages),
        plan_template_id: saved.planTemplateId,
        cache: { hit: true, matchedBy: saved.matchedBy, uin: uinInfo.uin },
        pages: saved.pages,
        total_pages: totalPages,
        scanned_pdf_warning: scannedPdfWarning,
        extraction_stats: statsFor(saved.rules),
        processing_time_ms: Date.now() - startTime,
      }
      return NextResponse.json({ success: true, data: result })
    }

    // ── 5. AI extraction ────────────────────────────────────────────────────
    const aiResult = await extractPolicyWithAI(pages)

    // ── 6. Validate evidence & enrich rules ─────────────────────────────────
    const rules = validateAndEnrichRules(aiResult.rules || [], pages)
    const stats = statsFor(rules)

    // ── 7. Deterministically compile into executable rules (Blueprint F2) ───
    const compiled_rules = compilePolicyRules(rules, pages)

    // ── 8. Coverage amount and UIN, each checked against the document text ──
    const llmOverview = aiResult.overview as typeof aiResult.overview & { sum_insured_amount?: number | null; uin?: string }
    const si = resolveSumInsured(pages, llmOverview.sum_insured_amount, llmOverview.sum_insured)
    const finalUin = extractUin(pages, llmOverview.uin).uin
    const overview = {
      ...aiResult.overview,
      sum_insured: llmOverview.sum_insured || (si.amount ? formatINR(si.amount) : ''),
      sum_insured_amount: si.amount,
      sum_insured_source: si.source,
      uin: finalUin ?? undefined,
      total_pages: totalPages,
    }

    // ── 9. Save for next time (never blocks or breaks the response) ─────────
    const confidence =
      rules.length === 0 ? 'low' : stats.high_confidence / rules.length >= 0.6 ? 'high' : stats.high_confidence / rules.length >= 0.3 ? 'medium' : 'low'
    const planTemplateId = await saveAnalysis({
      uin: finalUin,
      hash,
      overview,
      rules,
      compiledRules: compiled_rules,
      pages,
      confidence,
    })

    const result: PolicyAnalysisResult = {
      overview,
      rules,
      compiled_rules,
      plan_template_id: planTemplateId,
      cache: { hit: false, matchedBy: null, uin: finalUin },
      pages,
      total_pages: totalPages,
      scanned_pdf_warning: scannedPdfWarning,
      extraction_stats: stats,
      processing_time_ms: Date.now() - startTime,
    }

    return NextResponse.json({ success: true, data: result })
  } catch (err: any) {
    console.error('[policy/analyze]', err)
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'An unexpected error occurred during analysis.',
      },
      { status: 500 },
    )
  }
}
