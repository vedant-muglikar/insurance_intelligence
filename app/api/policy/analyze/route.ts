import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { detectScannedPdf } from '@/lib/pdf/extractor'
import { extractPagesHybrid } from '@/lib/pdf/hybrid'
import { PdfInputError, readValidatedPdfUpload } from '@/lib/pdf/validation'
import { getOcrConfig } from '@/lib/ocr/config'
import { extractPolicyWithAI, validateAndEnrichRules } from '@/lib/ai/extractor'
import { compilePolicyRules } from '@/lib/policy/compiler'
import { createClient } from '@/utils/supabase/server'
import { extractUin, documentHash } from '@/lib/policy/identity'
import { resolveSumInsured } from '@/lib/policy/sumInsured'
import { findSavedAnalysis, saveAnalysis } from '@/lib/policy/store'
import { formatINR } from '@/lib/policy/normalizers'
import type { AnalysisProgressEvent, PolicyAnalysisResult, PolicyRule } from '@/lib/types/policy'

function statsFor(rules: PolicyRule[]): NonNullable<PolicyAnalysisResult['extraction_stats']> {
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
    validated_count: n((r) => !!r.evidence_validated),
  }
}

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
  const scannedPdfWarning =
    report.pages_needing_rescan.length > 0 || report.failed_pages > 0 || (report.ocr_engine === null && detectScannedPdf(pages))

  // ── 2. Identify the document: UIN (product version) and text hash ─────────
  const uinInfo = extractUin(pages)
  const hash = documentHash(pages)

  // ── 3. Check verified policy cache (avoid redundant extraction) ──────────
  const saved = await findSavedAnalysis({ uin: uinInfo.uin, hash, pages })
  if (saved) {
    emit({ type: 'stage', stage: 'complete', message: 'Loaded from verified policy cache', progress: 100 })
    return {
      overview: { ...saved.overview, total_pages: totalPages },
      rules: saved.rules,
      compiled_rules: saved.compiledRules.length ? saved.compiledRules : compilePolicyRules(saved.rules, saved.pages),
      plan_template_id: saved.planTemplateId,
      cache: { hit: true, matchedBy: saved.matchedBy, uin: uinInfo.uin },
      pages: saved.pages,
      total_pages: totalPages,
      scanned_pdf_warning: scannedPdfWarning,
      extraction_report: report,
      document_hash: hash,
      extraction_stats: statsFor(saved.rules),
      processing_time_ms: Date.now() - startTime,
    }
  }

  // ── 4. AI extraction (OCR pages carry provenance notes) ───────────────────
  emit({ type: 'stage', stage: 'ai_analysis', message: 'Extracting coverage, limits and exclusions with AI…', progress: 70 })
  const aiResult = await extractPolicyWithAI(pages)
  if (signal.aborted) throw Object.assign(new Error('Extraction cancelled.'), { name: 'AbortError' })

  // ── 5. Validate evidence & enrich rules ───────────────────────────────────
  emit({ type: 'stage', stage: 'evidence_validation', message: 'Cross-checking citations against page text…', progress: 92 })
  const rules = validateAndEnrichRules(aiResult.rules || [], pages)
  const stats = statsFor(rules)

  // ── 6. Deterministically compile into executable rules (Blueprint F2) ─────
  const compiled_rules = compilePolicyRules(rules, pages)

  // ── 7. Coverage amount and UIN verified against document text ─────────────
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

  // ── 8. Save for future cache hits ─────────────────────────────────────────
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

  emit({ type: 'stage', stage: 'complete', message: 'Analysis complete', progress: 100 })

  return {
    overview,
    rules,
    compiled_rules,
    plan_template_id: planTemplateId,
    cache: { hit: false, matchedBy: null, uin: finalUin },
    pages,
    total_pages: totalPages,
    scanned_pdf_warning: scannedPdfWarning,
    extraction_report: report,
    document_hash: hash,
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

  // ── Validate upload before doing heavy work ──────────────────────────────
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
