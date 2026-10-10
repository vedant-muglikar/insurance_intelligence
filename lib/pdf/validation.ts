import type { ExtractedPage } from '@/lib/types/policy'

/** An error caused by the uploaded file itself; its message is safe to show to users. */
export class PdfInputError extends Error {
  status: number
  constructor(message: string, status = 422) {
    super(message)
    this.name = 'PdfInputError'
    this.status = status
  }
}

/**
 * Validates an uploaded file before any parsing: presence, extension/MIME,
 * size, and the PDF magic header (the extension alone is not trusted).
 * Returns the file bytes on success.
 */
export async function readValidatedPdfUpload(
  file: File | null,
  maxSizeMb: number,
): Promise<ArrayBuffer> {
  if (!file || typeof file === 'string') throw new PdfInputError('No file provided.', 400)

  const name = (file.name || '').toLowerCase()
  const typeOk = !file.type || file.type === 'application/pdf' || file.type === 'application/octet-stream' || file.type === 'application/x-pdf'
  if (!name.endsWith('.pdf') || !typeOk) {
    throw new PdfInputError('Only PDF files are supported.', 400)
  }
  if (file.size === 0) throw new PdfInputError('The uploaded file is empty.', 400)
  if (file.size > maxSizeMb * 1024 * 1024) {
    throw new PdfInputError(`File exceeds the ${maxSizeMb} MB limit.`, 413)
  }

  const buffer = await file.arrayBuffer()
  if (!hasPdfHeader(new Uint8Array(buffer))) {
    throw new PdfInputError('This file is not a valid PDF document.', 400)
  }
  return buffer
}

/** PDF spec allows junk before the header; readers accept it within the first 1 KB. */
export function hasPdfHeader(bytes: Uint8Array): boolean {
  // TextDecoder (not Buffer) so the check also runs in the browser
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024))
  return head.includes('%PDF-')
}

/**
 * Checks if a PDF appears to be scanned (very little extractable text).
 * A PDF is considered scanned if >70% of pages have fewer than 50 characters.
 */
export function detectScannedPdf(pages: ExtractedPage[]): boolean {
  if (pages.length === 0) return false
  const lowTextPages = pages.filter((p) => p.char_count < 50).length
  return lowTextPages / pages.length > 0.7
}

/**
 * Tries to find evidence_text within the extracted page text.
 * Returns true if a substantial portion (>60%) of the evidence is found.
 */
export function validateEvidence(
  evidenceText: string,
  pageText: string,
): boolean {
  if (!evidenceText || !pageText) return false

  const normalise = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const normEvidence = normalise(evidenceText)
  const normPage = normalise(pageText)

  // Direct substring match
  if (normPage.includes(normEvidence)) return true

  // Sliding-window word overlap (>= 60% of evidence words found in page)
  const evidenceWords = normEvidence.split(' ').filter(Boolean)
  if (evidenceWords.length === 0) return false

  const pageWords = new Set(normPage.split(' ').filter(Boolean))
  const matched = evidenceWords.filter((w) => pageWords.has(w)).length
  return matched / evidenceWords.length >= 0.6
}
