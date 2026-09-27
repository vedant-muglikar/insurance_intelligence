import type { ExtractedPage } from '@/lib/types/policy'
const pdfParse = require('pdf-parse')

/**
 * Extracts text from each page of a PDF buffer using pdf-parse.
 * Returns an array of ExtractedPage objects.
 */
export async function extractPdfPages(buffer: ArrayBuffer): Promise<ExtractedPage[]> {
  const pages: ExtractedPage[] = []

  // Custom page renderer to capture text page-by-page
  function render_page(pageData: any) {
    const render_options = {
      normalizeWhitespace: false,
      disableCombineTextItems: false,
    }

    return pageData.getTextContent(render_options).then(function (textContent: any) {
      let text = ''
      for (const item of textContent.items) {
        text += item.str + ' '
      }
      const cleanText = text.replace(/\s+/g, ' ').trim()
      
      pages.push({
        page_number: pageData.pageIndex + 1,
        text: cleanText,
        char_count: cleanText.length,
      })

      return cleanText
    })
  }

  const options = {
    pagerender: render_page,
  }

  // Parse the PDF
  await pdfParse(Buffer.from(buffer), options)

  // Sort pages just in case promises resolved out of order
  pages.sort((a, b) => a.page_number - b.page_number)

  return pages
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
