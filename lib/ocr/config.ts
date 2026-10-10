/**
 * OCR / hybrid extraction limits. All values are server-side only and can be
 * tuned through environment variables without code changes.
 */

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]
  const parsed = raw ? parseInt(raw, 10) : NaN
  if (Number.isNaN(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

export interface OcrConfig {
  enabled: boolean
  /** Hard upload limit for policy PDFs */
  maxFileSizeMb: number
  /** Total pages accepted in one PDF */
  maxPages: number
  /** Maximum pages that will be OCR'd in a single request */
  maxOcrPages: number
  /** Parallel Tesseract workers */
  concurrency: number
  /** Render resolution for OCR */
  dpi: number
  /** Per-page OCR timeout */
  pageTimeoutMs: number
  /** Total OCR budget per request; remaining pages are skipped and flagged */
  totalTimeoutMs: number
  /** Text-layer pages with fewer chars than this are treated as needing OCR */
  minTextChars: number
}

export function getOcrConfig(): OcrConfig {
  return {
    enabled: process.env.OCR_ENABLED !== 'false',
    maxFileSizeMb: intEnv('PDF_MAX_FILE_SIZE_MB', 100, 1, 100),
    maxPages: intEnv('PDF_MAX_PAGES', 300, 1, 2000),
    maxOcrPages: intEnv('OCR_MAX_PAGES', 60, 0, 500),
    concurrency: intEnv('OCR_CONCURRENCY', 2, 1, 8),
    dpi: intEnv('OCR_DPI', 300, 150, 400),
    pageTimeoutMs: intEnv('OCR_PAGE_TIMEOUT_MS', 45_000, 5_000, 180_000),
    totalTimeoutMs: intEnv('OCR_TOTAL_TIMEOUT_MS', 180_000, 10_000, 900_000),
    minTextChars: intEnv('OCR_MIN_TEXT_CHARS', 80, 0, 2000),
  }
}

/** Confidence thresholds (Tesseract 0–100 scale) */
export const OCR_THRESHOLDS = {
  /** Words below this are listed as uncertain */
  lowWordConfidence: 60,
  /** Page quality buckets by mean word confidence */
  good: 85,
  fair: 70,
  poor: 45,
  /** Fewer recognised words than this on a page that should have text = unreadable */
  minWords: 8,
} as const
