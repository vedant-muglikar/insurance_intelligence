/**
 * Rebuilds readable structure from PDF text-layer items (pdf.js TextItem shape,
 * shared by pdf-parse's bundled pdf.js and pdfjs-dist):
 *  - a y-position change starts a new line (headings, clause numbers)
 *  - a wide horizontal gap on the same line starts a new table cell,
 *    rendered as `| cell | cell |`
 */

export interface PdfTextItem {
  str: string
  transform?: number[]
  width?: number
}

export function textItemsToStructuredText(items: PdfTextItem[]): string {
  const lines: string[][] = []
  let lastY: number | null = null
  let lastEndX: number | null = null

  for (const item of items) {
    if (typeof item?.str !== 'string') continue
    const t = Array.isArray(item.transform) ? item.transform : null
    const y = t ? t[5] : null
    const x = t ? t[4] : null
    const fontSize = t ? Math.hypot(t[0], t[1]) || 10 : 10

    const newLine = lines.length === 0 || (lastY !== null && y !== null && Math.abs(y - lastY) > 2)

    // pdf.js emits synthetic whitespace items spanning column gaps; they must
    // not count as content or the gap between real items disappears.
    if (item.str.trim() === '') {
      if (newLine) {
        lines.push([''])
        lastEndX = null
      }
      if (y !== null) lastY = y
      continue
    }

    if (newLine) {
      lines.push([item.str])
    } else {
      const cells = lines[lines.length - 1]
      const gap = x !== null && lastEndX !== null ? x - lastEndX : 0
      if (gap > Math.max(fontSize * 3, 15)) cells.push(item.str)
      else cells[cells.length - 1] += ' ' + item.str
    }
    if (y !== null) lastY = y
    lastEndX = x !== null && typeof item.width === 'number' ? x + item.width : null
  }

  return lines
    .map((cells) => cells.map((c) => c.replace(/\s+/g, ' ').trim()).filter(Boolean))
    .filter((cells) => cells.length > 0)
    .map((cells) => (cells.length >= 2 ? `| ${cells.join(' | ')} |` : cells[0]))
    .join('\n')
}
