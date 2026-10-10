/**
 * Hybrid PDF extraction: existing text-layer extraction (pdf-parse) for pages
 * with good embedded text, Tesseract OCR for scanned / garbled pages, and both
 * for text pages that also carry large images.
 *
 * Pages are classified one at a time and OCR'd through a bounded worker pool,
 * so memory stays flat for large documents. Per-page and total OCR budgets
 * guarantee the request finishes; pages that could not be processed are
 * flagged rather than silently dropped.
 */

import type {
  AnalysisProgressEvent,
  ExtractedPage,
  ExtractionReport,
  PageExtractionMethod,
  PageExtractionSummary,
  PageOcrInfo,
  PageOcrQuality,
} from '@/lib/types/policy'
import { extractPdfPages } from './extractor'
import { PdfInputError } from './validation'
import { getOcrConfig, OCR_THRESHOLDS, type OcrConfig } from '@/lib/ocr/config'
import { classifyPage, type PageImageInfo, type PageRoute } from '@/lib/ocr/pageClassifier'
import { buildLayoutText, linesFromTesseractBlocks, type LayoutResult } from '@/lib/ocr/layout'
import { preprocessForOcr, type PreprocessResult } from '@/lib/ocr/preprocess'
import {
  analyzePageImages,
  extractPageTextLayer,
  openPdf,
  renderPageToPng,
  type OpenedPdf,
} from '@/lib/ocr/pdfRenderer'
import { OCR_ENGINE_NAME, recognizePage } from '@/lib/ocr/tesseract'

export interface HybridExtractionOptions {
  onProgress?: (event: AnalysisProgressEvent) => void
  signal?: AbortSignal
  config?: Partial<OcrConfig>
}

export interface HybridExtractionResult {
  pages: ExtractedPage[]
  report: ExtractionReport
}

/** Overall-progress band (0–100) this stage reports into */
const PROGRESS = { textStart: 2, detectStart: 8, ocrStart: 15, ocrEnd: 65 }
const BLANK_INK_RATIO = 0.002
const PREVIEW_CHARS = 300
const HYBRID_HEADER = '[OCR — additional text recognised from images on this page]'

interface PagePlan {
  page_number: number
  textLayer: string
  images: PageImageInfo
  route: PageRoute
  reason: string
}

interface OcrOutcome {
  layout: LayoutResult
  pre: PreprocessResult
  dpi: number
  blank: boolean
  durationMs: number
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    const err = new Error('Extraction cancelled.')
    err.name = 'AbortError'
    throw err
  }
}

function qualityFor(layout: LayoutResult): PageOcrQuality {
  if (layout.wordCount < OCR_THRESHOLDS.minWords || layout.meanConfidence < OCR_THRESHOLDS.poor) {
    return 'unreadable'
  }
  if (layout.meanConfidence < OCR_THRESHOLDS.fair) return 'poor'
  if (layout.meanConfidence < OCR_THRESHOLDS.good) return 'fair'
  return 'good'
}

function buildOcrInfo(outcome: OcrOutcome, images: PageImageInfo): PageOcrInfo {
  const { layout, pre } = outcome
  const warnings: string[] = []
  let quality: PageOcrQuality

  if (outcome.blank) {
    quality = 'good'
    warnings.push('Page appears to be blank.')
  } else {
    quality = qualityFor(layout)
    const pct = Math.round(layout.meanConfidence)
    if (quality === 'unreadable') {
      warnings.push(
        'Text on this page could not be read reliably. Please upload a clearer scan (300 DPI or higher, flat and well-lit).',
      )
    } else if (quality === 'poor') {
      warnings.push(`Low OCR confidence (${pct}%). Some words may be misread — a clearer scan is recommended.`)
    }
    if (layout.ambiguousAmounts.length > 0) {
      warnings.push(
        `${layout.ambiguousAmounts.length} monetary value(s) could not be read reliably and were not auto-corrected: ${layout.ambiguousAmounts.slice(0, 5).join(', ')}`,
      )
    }
    if (images.minImageDpi !== null && images.minImageDpi < 150) {
      warnings.push(`Scanned image resolution is about ${images.minImageDpi} DPI; 300 DPI is recommended.`)
    }
  }

  return {
    confidence: Math.round(layout.meanConfidence),
    quality,
    word_count: layout.wordCount,
    deskew_angle: pre.deskewAngle,
    dpi: outcome.dpi,
    uncertain_tokens: layout.uncertainTokens,
    ambiguous_amounts: layout.ambiguousAmounts,
    table_rows_detected: layout.tableRows,
    duration_ms: outcome.durationMs,
    warnings,
  }
}

const wordsOf = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3)

/** OCR rows whose words are mostly absent from the text layer (i.e. text that only exists inside images) */
function novelOcrRows(layout: LayoutResult, textLayer: string): string[] {
  const known = new Set(wordsOf(textLayer))
  return layout.rows
    .filter((row) => {
      const words = wordsOf(row.plain)
      if (words.length < 2) return false
      const unseen = words.filter((w) => !known.has(w)).length
      return unseen / words.length >= 0.5
    })
    .map((row) => row.text)
}

async function ocrPage(pdf: OpenedPdf, pageNumber: number, cfg: OcrConfig): Promise<OcrOutcome> {
  const started = Date.now()
  const page = await pdf.getPage(pageNumber)
  const rendered = await renderPageToPng(page, cfg.dpi)
  const pre = await preprocessForOcr(rendered.png)

  if (pre.inkRatio < BLANK_INK_RATIO) {
    return {
      layout: buildLayoutText([]),
      pre,
      dpi: rendered.dpi,
      blank: true,
      durationMs: Date.now() - started,
    }
  }

  const result = await recognizePage(pre.image, {
    concurrency: cfg.concurrency,
    dpi: rendered.dpi,
    timeoutMs: cfg.pageTimeoutMs,
  })
  return {
    layout: buildLayoutText(linesFromTesseractBlocks(result.blocks)),
    pre,
    dpi: rendered.dpi,
    blank: false,
    durationMs: Date.now() - started,
  }
}

function textOnlyReport(pages: ExtractedPage[], startedAt: number, warnings: string[]): ExtractionReport {
  return {
    total_pages: pages.length,
    text_layer_pages: pages.length,
    ocr_pages: 0,
    hybrid_pages: 0,
    failed_pages: 0,
    pages_needing_rescan: [],
    pages_with_ambiguous_amounts: [],
    skipped_pages: [],
    average_ocr_confidence: null,
    ocr_engine: null,
    pages: pages.map((p) => ({
      page_number: p.page_number,
      method: 'text_layer',
      reason: `Embedded text layer with ${p.char_count} characters`,
      char_count: p.char_count,
      image_coverage: 0,
      needs_clearer_scan: false,
      warnings: [],
      preview: p.text.slice(0, PREVIEW_CHARS),
    })),
    warnings,
    duration_ms: Date.now() - startedAt,
  }
}

export async function extractPagesHybrid(
  buffer: ArrayBuffer,
  options: HybridExtractionOptions = {},
): Promise<HybridExtractionResult> {
  const startedAt = Date.now()
  const cfg: OcrConfig = { ...getOcrConfig(), ...options.config }
  const emit = options.onProgress ?? (() => {})
  const { signal } = options

  // ── 1. Existing text-layer extraction ────────────────────────────────────
  emit({ type: 'stage', stage: 'text_extraction', message: 'Reading embedded text layer…', progress: PROGRESS.textStart })
  let textPages: ExtractedPage[] = []
  let textLayerError: unknown = null
  try {
    textPages = await extractPdfPages(buffer.slice(0))
  } catch (err) {
    // Some scanned/odd PDFs trip pdf-parse but still render fine — OCR can recover them.
    textLayerError = err
  }

  if (!cfg.enabled) {
    if (textLayerError) throw textLayerError
    const pages = textPages.map((p) => ({ ...p, extraction_method: 'text_layer' as const }))
    return { pages, report: textOnlyReport(pages, startedAt, ['OCR is disabled (OCR_ENABLED=false).']) }
  }

  let pdf: OpenedPdf
  try {
    pdf = await openPdf(new Uint8Array(buffer))
  } catch (err) {
    if (err instanceof PdfInputError) throw err
    if (textPages.length > 0) {
      console.warn('[hybrid] page renderer unavailable, using text layer only:', (err as Error)?.message)
      const pages = textPages.map((p) => ({ ...p, extraction_method: 'text_layer' as const }))
      return { pages, report: textOnlyReport(pages, startedAt, ['Page images could not be rendered, so OCR was skipped.']) }
    }
    throw new PdfInputError('Could not read this PDF. It may be corrupted or use an unsupported format.')
  }

  try {
    const numPages = pdf.numPages
    if (numPages === 0) throw new PdfInputError('This PDF has no pages.')
    if (numPages > cfg.maxPages) {
      throw new PdfInputError(`This PDF has ${numPages} pages; the limit is ${cfg.maxPages}.`, 413)
    }
    const textByPage = new Map(textPages.map((p) => [p.page_number, p.text]))

    // ── 2. Per-page detection ──────────────────────────────────────────────
    emit({ type: 'stage', stage: 'page_detection', message: `Checking ${numPages} page(s) for embedded text…`, progress: PROGRESS.detectStart })
    const plans: PagePlan[] = []
    for (let n = 1; n <= numPages; n++) {
      throwIfAborted(signal)
      let images: PageImageInfo = { imageCoverage: 0, imageCount: 0, minImageDpi: null }
      let textLayer = textByPage.get(n) ?? ''
      try {
        const page = await pdf.getPage(n)
        images = await analyzePageImages(page)
        if (textLayerError) textLayer = await extractPageTextLayer(page)
        page.cleanup()
      } catch (err) {
        console.warn(`[hybrid] page analysis failed for page ${n}:`, (err as Error)?.message)
      }
      const { route, reason } = classifyPage(textLayer, images, cfg.minTextChars)
      plans.push({ page_number: n, textLayer, images, route, reason })
      emit({
        type: 'page',
        page_number: n,
        total_pages: numPages,
        method: route,
        status: 'detected',
        reason,
      })
      if (n % 10 === 0 || n === numPages) {
        emit({
          type: 'stage',
          stage: 'page_detection',
          message: `Checked ${n} of ${numPages} pages`,
          progress: PROGRESS.detectStart + ((PROGRESS.ocrStart - PROGRESS.detectStart) * n) / numPages,
        })
      }
    }

    // ── 3. OCR (bounded pool, page budget, time budget) ───────────────────
    const candidates = plans.filter((p) => p.route !== 'text_layer')
    const queue = candidates.slice(0, cfg.maxOcrPages)
    const overLimit = new Set(candidates.slice(cfg.maxOcrPages).map((p) => p.page_number))
    const outcomes = new Map<number, OcrOutcome>()
    const ocrErrors = new Map<number, string>()
    const timedOut = new Set<number>()
    const ocrStartedAt = Date.now()
    let completed = 0

    if (queue.length > 0) {
      emit({
        type: 'stage',
        stage: 'ocr',
        message: `Running OCR on ${queue.length} scanned/image page(s)…`,
        progress: PROGRESS.ocrStart,
      })
    }

    let cursor = 0
    const worker = async () => {
      while (cursor < queue.length) {
        const plan = queue[cursor++]
        throwIfAborted(signal)
        if (Date.now() - ocrStartedAt > cfg.totalTimeoutMs) {
          timedOut.add(plan.page_number)
          continue
        }
        emit({ type: 'page', page_number: plan.page_number, total_pages: numPages, method: plan.route, status: 'ocr_started' })
        try {
          outcomes.set(plan.page_number, await ocrPage(pdf, plan.page_number, cfg))
        } catch (err: any) {
          if (err?.name === 'AbortError') throw err
          console.warn(`[hybrid] OCR failed on page ${plan.page_number}:`, err?.message)
          ocrErrors.set(plan.page_number, err?.name === 'OcrTimeoutError' ? 'OCR timed out on this page' : 'OCR failed on this page')
        }
        completed++
        const outcome = outcomes.get(plan.page_number)
        const info = outcome ? buildOcrInfo(outcome, plan.images) : undefined
        emit({
          type: 'page',
          page_number: plan.page_number,
          total_pages: numPages,
          method: plan.route,
          status: 'ocr_done',
          ocr_confidence: info?.confidence,
          ocr_quality: info?.quality,
          needs_clearer_scan: info ? info.quality === 'poor' || info.quality === 'unreadable' : true,
          warnings: info?.warnings ?? [ocrErrors.get(plan.page_number) ?? 'OCR failed'],
          preview: outcome?.layout.text.slice(0, PREVIEW_CHARS),
        })
        emit({
          type: 'stage',
          stage: 'ocr',
          message: `OCR: ${completed} of ${queue.length} page(s) processed`,
          progress: PROGRESS.ocrStart + ((PROGRESS.ocrEnd - PROGRESS.ocrStart) * completed) / queue.length,
        })
      }
    }
    await Promise.all(Array.from({ length: Math.min(cfg.concurrency, queue.length) }, worker))

    // ── 4. Assemble pages + report ─────────────────────────────────────────
    const pages: ExtractedPage[] = []
    const summaries: PageExtractionSummary[] = []
    const reportWarnings: string[] = []
    if (textLayerError) {
      reportWarnings.push('The primary text extractor could not parse this PDF; a fallback text-layer extractor was used.')
    }
    if (overLimit.size > 0) {
      reportWarnings.push(`${overLimit.size} page(s) were not OCR'd because the ${cfg.maxOcrPages}-page OCR limit was reached.`)
    }
    if (timedOut.size > 0) {
      reportWarnings.push(`${timedOut.size} page(s) were not OCR'd because the OCR time budget was exhausted.`)
    }

    for (const plan of plans) {
      const outcome = outcomes.get(plan.page_number)
      const ocr = outcome ? buildOcrInfo(outcome, plan.images) : undefined
      const pageWarnings: string[] = [...(ocr?.warnings ?? [])]
      let method: PageExtractionMethod = 'text_layer'
      let text = plan.textLayer
      let reason = plan.reason

      if (plan.route === 'ocr') {
        if (outcome && outcome.layout.text) {
          method = 'ocr'
          text = outcome.layout.text
        } else if (outcome?.blank) {
          method = 'ocr'
        } else {
          const why =
            ocrErrors.get(plan.page_number) ??
            (overLimit.has(plan.page_number)
              ? 'Not OCR\'d: OCR page limit reached'
              : timedOut.has(plan.page_number)
                ? 'Not OCR\'d: OCR time budget exhausted'
                : 'OCR found no readable text')
          pageWarnings.push(why)
          method = plan.textLayer.trim() ? 'text_layer' : 'failed'
          reason = `${plan.reason}. ${why}`
        }
      } else if (plan.route === 'hybrid') {
        const extra = outcome ? novelOcrRows(outcome.layout, plan.textLayer) : []
        if (extra.length > 0) {
          method = 'hybrid'
          text = `${plan.textLayer}\n\n${HYBRID_HEADER}\n${extra.join('\n')}`
        } else {
          reason = outcome
            ? `${plan.reason}. Image text was already present in the text layer`
            : `${plan.reason}. ${ocrErrors.get(plan.page_number) ?? 'Image OCR skipped'}`
        }
      }

      const ocrIsUnusable = method === 'ocr' && ocr && !outcome?.blank && (ocr.quality === 'poor' || ocr.quality === 'unreadable')
      const needsRescan =
        method === 'failed' && !overLimit.has(plan.page_number) && !timedOut.has(plan.page_number)
          ? true
          : !!ocrIsUnusable
      if (method === 'failed' && !pageWarnings.some((w) => w.includes('clearer scan'))) {
        pageWarnings.push('No text could be extracted from this page. Please upload a clearer scan.')
      }

      const page: ExtractedPage = {
        page_number: plan.page_number,
        text,
        char_count: text.length,
        extraction_method: method,
        ...(ocr ? { ocr } : {}),
      }
      pages.push(page)
      summaries.push({
        page_number: plan.page_number,
        method,
        reason,
        char_count: text.length,
        image_coverage: Math.round(plan.images.imageCoverage * 100) / 100,
        ocr_confidence: ocr && !outcome?.blank ? ocr.confidence : undefined,
        ocr_quality: ocr && !outcome?.blank ? ocr.quality : undefined,
        needs_clearer_scan: needsRescan,
        warnings: pageWarnings,
        preview: text.slice(0, PREVIEW_CHARS),
      })
      emit({
        type: 'page',
        page_number: plan.page_number,
        total_pages: numPages,
        method,
        status: 'done',
        ocr_confidence: summaries[summaries.length - 1].ocr_confidence,
        ocr_quality: summaries[summaries.length - 1].ocr_quality,
        needs_clearer_scan: needsRescan,
        warnings: pageWarnings,
        preview: text.slice(0, PREVIEW_CHARS),
      })
    }

    const ocrConfidences = summaries
      .filter((s) => s.ocr_confidence !== undefined && (s.method === 'ocr' || s.method === 'hybrid'))
      .map((s) => s.ocr_confidence as number)

    const report: ExtractionReport = {
      total_pages: numPages,
      text_layer_pages: summaries.filter((s) => s.method === 'text_layer').length,
      ocr_pages: summaries.filter((s) => s.method === 'ocr').length,
      hybrid_pages: summaries.filter((s) => s.method === 'hybrid').length,
      failed_pages: summaries.filter((s) => s.method === 'failed').length,
      pages_needing_rescan: summaries.filter((s) => s.needs_clearer_scan).map((s) => s.page_number),
      pages_with_ambiguous_amounts: pages
        .filter((p) => (p.extraction_method === 'ocr' || p.extraction_method === 'hybrid') && (p.ocr?.ambiguous_amounts.length ?? 0) > 0)
        .map((p) => p.page_number),
      skipped_pages: [...overLimit, ...timedOut].sort((a, b) => a - b),
      average_ocr_confidence: ocrConfidences.length
        ? Math.round(ocrConfidences.reduce((a, b) => a + b, 0) / ocrConfidences.length)
        : null,
      ocr_engine: outcomes.size > 0 ? OCR_ENGINE_NAME : null,
      pages: summaries,
      warnings: reportWarnings,
      duration_ms: Date.now() - startedAt,
    }

    return { pages, report }
  } finally {
    await pdf.destroy().catch(() => {})
  }
}
