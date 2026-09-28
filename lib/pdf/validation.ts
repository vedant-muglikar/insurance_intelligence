import type { ExtractedPage } from '@/lib/types/policy'

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
