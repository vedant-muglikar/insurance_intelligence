import type { ExtractedPage } from '@/lib/types/policy'
import { textItemsToStructuredText } from './textLayout'
export { detectScannedPdf, validateEvidence } from './validation'
// OCR-aware extraction lives in ./hybrid (imported directly by routes so that
// lightweight consumers of this module don't load the OCR stack).

/**
 * Extracts text from each page of a PDF buffer using pdf-parse.
 * Returns an array of ExtractedPage objects.
 */
export async function extractPdfPages(buffer: ArrayBuffer): Promise<ExtractedPage[]> {
  const pdfParse = require('pdf-parse')
  const pages: ExtractedPage[] = []

  // Custom page renderer to capture text page-by-page
  function render_page(pageData: any) {
    const render_options = {
      normalizeWhitespace: false,
      disableCombineTextItems: false,
    }

    return pageData.getTextContent(render_options).then(function (textContent: any) {
      // Keep lines and table cells instead of flattening the page into one line
      const cleanText = textItemsToStructuredText(textContent.items)
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


