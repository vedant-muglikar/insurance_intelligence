import type { ExtractedPage } from '@/lib/types/policy'
export { detectScannedPdf, validateEvidence } from './validation'

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


