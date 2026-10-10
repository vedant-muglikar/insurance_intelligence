import type { ExtractedPage } from '@/lib/types/policy'

/**
 * Page header used in every AI prompt. Text-layer pages keep the original
 * `[PAGE n]` header; OCR pages additionally carry provenance, confidence and
 * explicit "do not guess" notes for values OCR could not read reliably.
 */
export function formatPageHeader(page: ExtractedPage): string {
  const method = page.extraction_method ?? 'text_layer'
  if (method === 'text_layer' || method === 'failed' || !page.ocr) return `[PAGE ${page.page_number}]`

  const { ocr } = page
  const source =
    method === 'hybrid'
      ? `embedded text + OCR of images, OCR confidence ${ocr.confidence}%`
      : `OCR of scanned image, confidence ${ocr.confidence}% (${ocr.quality})`
  const lines = [`[PAGE ${page.page_number} — ${source}]`]

  if (ocr.quality === 'unreadable') {
    lines.push('[OCR NOTE: this page is largely unreadable. Do not infer policy terms from it.]')
  }
  if (ocr.ambiguous_amounts.length > 0) {
    const values = ocr.ambiguous_amounts.slice(0, 10).map((v) => `"${v}"`).join(', ')
    lines.push(`[OCR NOTE: these values could not be read reliably — do not guess or correct them: ${values}]`)
  }
  return lines.join('\n')
}

export function formatPageForPrompt(page: ExtractedPage, text: string = page.text): string {
  return `${formatPageHeader(page)}\n${text}`
}

/** Instructions appended to system prompts whenever pages may contain OCR text */
export const OCR_PROMPT_RULES = `
DOCUMENT FORMAT NOTES:
- Some pages were extracted by OCR from scanned images; their [PAGE] header says so and gives a confidence score.
- A token followed by [?] was read with low confidence by OCR. NEVER correct, complete or guess such values. If a rule's key value (amount, percentage, duration) contains [?] or appears in an [OCR NOTE], still report the rule, copy the value exactly as shown (including [?]), and set confidence "low" and status "unclear".
- Table rows appear as "| cell | cell | cell |". Keep each value tied to its row and column labels.
- Lines starting with "## " are headings — use them (with any clause number such as 4.1.2) as section_name.
- Page numbers in [PAGE n] headers are the original PDF page numbers; cite them exactly.`
