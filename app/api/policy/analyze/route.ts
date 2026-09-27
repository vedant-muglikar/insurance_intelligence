import { NextRequest, NextResponse } from 'next/server'
import { extractPdfPages, detectScannedPdf } from '@/lib/pdf/extractor'
import { extractPolicyWithAI, validateAndEnrichRules } from '@/lib/ai/extractor'
import type { PolicyAnalysisResult } from '@/lib/types/policy'

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

    // ── 3. AI extraction ────────────────────────────────────────────────────
    const aiResult = await extractPolicyWithAI(pages)

    // ── 4. Validate evidence & enrich rules ─────────────────────────────────
    const rules = validateAndEnrichRules(aiResult.rules || [], pages)

    // ── 5. Compute extraction stats ─────────────────────────────────────────
    const stats = {
      total_rules: rules.length,
      coverage_count: rules.filter((r) => r.category === 'coverage').length,
      exclusion_count: rules.filter((r) => r.category === 'exclusion').length,
      waiting_period_count: rules.filter((r) => r.category === 'waiting_period').length,
      limit_count: rules.filter(
        (r) =>
          r.category === 'room_rent' ||
          r.category === 'icu_limit' ||
          r.category === 'sub_limit' ||
          r.category === 'deductible' ||
          r.category === 'co_payment',
      ).length,
      eligibility_count: rules.filter((r) => r.category === 'eligibility').length,
      claim_requirement_count: rules.filter((r) => r.category === 'claim_requirement').length,
      high_confidence: rules.filter((r) => r.confidence === 'high').length,
      medium_confidence: rules.filter((r) => r.confidence === 'medium').length,
      low_confidence: rules.filter((r) => r.confidence === 'low').length,
      validated_count: rules.filter((r) => r.evidence_validated).length,
    }

    const result: PolicyAnalysisResult = {
      overview: {
        ...aiResult.overview,
        total_pages: totalPages,
      },
      rules,
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
