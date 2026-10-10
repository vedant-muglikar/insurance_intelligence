import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { detectScannedPdf } from '@/lib/pdf/extractor'
import { extractPagesHybrid } from '@/lib/pdf/hybrid'
import { PdfInputError, readValidatedPdfUpload } from '@/lib/pdf/validation'
import { getOcrConfig } from '@/lib/ocr/config'
import { extractPolicyWithAI, validateAndEnrichRules } from '@/lib/ai/extractor'
import { compilePolicyRules } from '@/lib/policy/compiler'
import { createClient } from '@/utils/supabase/server'
import type { AnalysisProgressEvent, PolicyAnalysisResult } from '@/lib/types/policy'

export const runtime = 'nodejs'
export const maxDuration = 300 // seconds — OCR of scanned pages + long AI calls

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}

/**
 * Uploads contain sensitive personal/medical data and OCR is CPU-heavy, so the
 * endpoint requires a signed-in user whenever Supabase auth is configured.
 * Set ALLOW_ANONYMOUS_UPLOADS=true only for local testing.
 */
async function isAuthorized(): Promise<boolean> {
  if (process.env.ALLOW_ANONYMOUS_UPLOADS === 'true') return true
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return true
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    return !!data.user
  } catch {
    return false
  }
}

async function runAnalysis(
  buffer: ArrayBuffer,
  emit: (event: AnalysisProgressEvent) => void,
  signal: AbortSignal,
): Promise<PolicyAnalysisResult> {
  const startTime = Date.now()

  // ── 1. Hybrid extraction: text layer + OCR for scanned pages ────────────
  const { pages, report } = await extractPagesHybrid(buffer, { onProgress: emit, signal })

  if (pages.length === 0) {
    throw new PdfInputError('Could not extract any pages from this PDF.')
  }
  if (pages.every((p) => p.text.trim().length === 0)) {
    throw new PdfInputError(
      'No readable text was found in this PDF, even with OCR. Please upload a clearer scan (300 DPI or higher) or a text-based PDF.',
    )
  }

  const totalPages = pages.length
  // Kept for backwards compatibility: true when OCR could not fully recover the document
  const scannedPdfWarning =
    report.pages_needing_rescan.length > 0 || report.failed_pages > 0 || (report.ocr_engine === null && detectScannedPdf(pages))

  // ── 2. AI extraction (unchanged pipeline; OCR pages carry provenance notes) ─
  emit({ type: 'stage', stage: 'ai_analysis', message: 'Extracting coverage, limits and exclusions with AI…', progress: 70 })
  const aiResult = await extractPolicyWithAI(pages)
  if (signal.aborted) throw Object.assign(new Error('Extraction cancelled.'), { name: 'AbortError' })

  // ── 3. Validate evidence & enrich rules (incl. OCR safeguards) ──────────
  emit({ type: 'stage', stage: 'evidence_validation', message: 'Cross-checking citations against page text…', progress: 92 })
  const rules = validateAndEnrichRules(aiResult.rules || [], pages)

  // ── 4. Compute extraction stats ─────────────────────────────────────────
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

  // ── 5. Deterministically compile into executable rules (Blueprint F2) ───
  const compiled_rules = compilePolicyRules(rules, pages)

  emit({ type: 'stage', stage: 'complete', message: 'Analysis complete', progress: 100 })

  return {
    overview: {
      ...aiResult.overview,
      total_pages: totalPages,
    },
    rules,
    compiled_rules,
    pages,
    total_pages: totalPages,
    scanned_pdf_warning: scannedPdfWarning,
    extraction_report: report,
    document_hash: createHash('sha256').update(new Uint8Array(buffer)).digest('hex'),
    extraction_stats: stats,
    processing_time_ms: Date.now() - startTime,
  }
}

function errorStatus(err: any): number {
  if (err instanceof PdfInputError) return err.status
  if (err?.name === 'AbortError') return 499
  return 500
}

function publicErrorMessage(err: any): string {
  if (err instanceof PdfInputError) return err.message
  if (err?.name === 'AbortError') return 'Analysis was cancelled.'
  return err?.message || 'An unexpected error occurred during analysis.'
}

export async function POST(request: NextRequest) {
  const wantsStream = request.nextUrl.searchParams.get('stream') === '1'

  if (!(await isAuthorized())) {
    return NextResponse.json(
      { success: false, error: 'Please sign in to analyze policy documents.' },
      { status: 401, headers: NO_STORE_HEADERS },
    )
  }

  // ── Validate upload before doing any heavy work ──────────────────────────
  let buffer: ArrayBuffer
  try {
    const formData = await request.formData()
    buffer = await readValidatedPdfUpload(formData.get('file') as File | null, getOcrConfig().maxFileSizeMb)
  } catch (err: any) {
    const status = err instanceof PdfInputError ? err.status : 400
    return NextResponse.json(
      { success: false, error: err instanceof PdfInputError ? err.message : 'Invalid upload.' },
      { status, headers: NO_STORE_HEADERS },
    )
  }

  // ── Plain JSON response (backwards compatible) ───────────────────────────
  if (!wantsStream) {
    try {
      const data = await runAnalysis(buffer, () => {}, request.signal)
      return NextResponse.json({ success: true, data }, { headers: NO_STORE_HEADERS })
    } catch (err: any) {
      console.error('[policy/analyze]', err?.name, err?.message)
      return NextResponse.json(
        { success: false, error: publicErrorMessage(err) },
        { status: errorStatus(err), headers: NO_STORE_HEADERS },
      )
    }
  }

  // ── NDJSON progress stream ────────────────────────────────────────────────
  const encoder = new TextEncoder()
  const abort = new AbortController()
  request.signal.addEventListener('abort', () => abort.abort())

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      const send = (event: AnalysisProgressEvent) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
        } catch {
          closed = true
        }
      }
      try {
        send({ type: 'stage', stage: 'validating', message: 'Upload received and validated', progress: 1 })
        const data = await runAnalysis(buffer, send, abort.signal)
        send({ type: 'result', data })
      } catch (err: any) {
        if (err?.name !== 'AbortError') console.error('[policy/analyze]', err?.name, err?.message)
        send({ type: 'error', error: publicErrorMessage(err) })
      } finally {
        closed = true
        try {
          controller.close()
        } catch {
          /* client went away */
        }
      }
    },
    cancel() {
      abort.abort()
    },
  })

  return new Response(stream, {
    headers: {
      ...NO_STORE_HEADERS,
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'X-Accel-Buffering': 'no',
    },
  })
}
