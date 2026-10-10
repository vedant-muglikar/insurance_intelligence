/**
 * Converts word-level OCR output (text + bounding boxes + confidence) into
 * structured page text the policy analyser can reason over:
 *
 *  - words on the same visual row are merged even when Tesseract splits them
 *    into separate blocks (typical for table columns)
 *  - wide horizontal gaps become table cells:  | Room Rent | 1% of SI | Page 4 |
 *  - large / ALL-CAPS / "Section N" rows become `## ` headings
 *  - paragraph breaks are kept as blank lines; clause numbers stay at line start
 *  - low-confidence words and ambiguous monetary values are suffixed with `[?]`
 *    and reported — they are never "corrected"
 *
 * Pure functions with no Tesseract dependency, so they are unit-testable.
 */

import type { OcrUncertainToken } from '@/lib/types/policy'
import { OCR_THRESHOLDS } from './config'

export interface OcrBox {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface OcrWord {
  text: string
  confidence: number
  bbox: OcrBox
}

export interface OcrLine {
  words: OcrWord[]
  bbox: OcrBox
}

export interface LayoutResult {
  text: string
  wordCount: number
  /** Length-weighted mean word confidence (0–100); 0 when no words */
  meanConfidence: number
  uncertainTokens: OcrUncertainToken[]
  ambiguousAmounts: string[]
  tableRows: number
  headingCount: number
  /** Each visual row as rendered (markers, table pipes) and as plain text — used for hybrid merging */
  rows: Array<{ text: string; plain: string }>
}

export const UNCERTAIN_MARKER = '[?]'
const MAX_UNCERTAIN_TOKENS = 40
const MAX_AMBIGUOUS_AMOUNTS = 20
/** Money is critical — require a higher confidence than ordinary words */
const AMOUNT_MIN_CONFIDENCE = 75

// ─── Token analysis ──────────────────────────────────────────────────────────

const CURRENCY_WORD = /^(₹|rs\.?|inr|rupees?)$/i
const LEADING_CURRENCY = /^(₹|rs\.?\s?|inr\s?)/i
const CONFUSABLE_NUMERIC = /^[\dOoIlSBZ|,.\-\/%]+$/
const CLAUSE_NUMBER = /^[‘'"(\[]?\d{1,2}(\.\d{1,2}){1,3}[)\].:]?$/

export interface TokenAnalysis {
  isNumeric: boolean
  isAmount: boolean
  flagged: boolean
  reason?: OcrUncertainToken['reason']
}

function stripTokenPunctuation(text: string): string {
  return text
    .replace(/^[(\[{"'“‘]+/, '')
    .replace(/[)\]}"'”’,;:]+$/, '')
    .replace(/\/-$/, '')
    .replace(/\.$/, '')
}

function hasValidGrouping(digits: string): boolean {
  const integer = digits.replace(/\.\d{1,2}$/, '')
  if (!integer.includes(',')) return /^\d+$/.test(integer)
  // Indian (5,00,000 / 1,50,00,000) or international (500,000) grouping
  return /^\d{1,3}(,\d{2})*,\d{3}$/.test(integer) || /^\d{1,3}(,\d{3})+$/.test(integer)
}

/**
 * Classifies one OCR word. `prevText` is the preceding word on the same row so
 * that "Rs 5,00,000" is recognised as an amount even when split into two words.
 */
export function analyzeToken(text: string, confidence: number, prevText?: string): TokenAnalysis {
  const raw = text.trim()
  const hasCurrencyPrefix = LEADING_CURRENCY.test(raw)
  const core = stripTokenPunctuation(raw.replace(LEADING_CURRENCY, ''))
  const hasDigit = /\d/.test(core)

  if (!hasDigit) {
    const flagged = confidence < OCR_THRESHOLDS.lowWordConfidence && /[\p{L}\p{N}]/u.test(raw)
    return { isNumeric: false, isAmount: false, flagged, reason: flagged ? 'low_confidence' : undefined }
  }

  const prevIsCurrency = !!prevText && CURRENCY_WORD.test(stripTokenPunctuation(prevText.trim()) || prevText.trim())
  const digitCount = (core.match(/\d/g) || []).length
  const isAmount =
    hasCurrencyPrefix ||
    prevIsCurrency ||
    /\/-$/.test(raw) ||
    (core.includes(',') && digitCount >= 4)

  // Digits mixed with look-alike letters (5,0O,000 · 2O% · l5 days)
  if (/[OoIlSBZ|]/.test(core) && CONFUSABLE_NUMERIC.test(core)) {
    return { isNumeric: true, isAmount, flagged: true, reason: 'confusable_characters' }
  }

  if (isAmount) {
    const numericPart = core.replace(/%$/, '')
    if (!hasValidGrouping(numericPart) || confidence < AMOUNT_MIN_CONFIDENCE) {
      return { isNumeric: true, isAmount, flagged: true, reason: 'ambiguous_amount' }
    }
    return { isNumeric: true, isAmount, flagged: false }
  }

  if (confidence < OCR_THRESHOLDS.lowWordConfidence) {
    return { isNumeric: true, isAmount: false, flagged: true, reason: 'low_confidence' }
  }
  return { isNumeric: true, isAmount: false, flagged: false }
}

// ─── Layout reconstruction ───────────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

interface Row {
  lines: OcrLine[]
  top: number
  bottom: number
  centerY: number
}

const HEADING_KEYWORD = /^(section|part|chapter|schedule|annexure|appendix|clause|article|table of benefits|policy schedule)\b/i

function isHeadingRow(text: string, wordHeight: number, medianWordHeight: number): boolean {
  if (text.length > 90) return false
  // Wrapped sentences/clauses continue onto the next line — not headings
  if (/[,;]$/.test(text)) return false
  const letters = text.replace(/[^\p{L}]/gu, '')
  if (letters.length < 3) return false
  if (wordHeight > medianWordHeight * 1.3 && text.split(/\s+/).length <= 12) return true
  const upper = letters.replace(/[^\p{Lu}]/gu, '').length
  if (letters.length >= 4 && upper / letters.length >= 0.8) return true
  return HEADING_KEYWORD.test(text) && text.split(/\s+/).length <= 10
}

export function buildLayoutText(lines: OcrLine[]): LayoutResult {
  const usable = lines
    .map((l) => ({ ...l, words: l.words.filter((w) => w.text.trim().length > 0) }))
    .filter((l) => l.words.length > 0)

  const empty: LayoutResult = {
    text: '',
    wordCount: 0,
    meanConfidence: 0,
    uncertainTokens: [],
    ambiguousAmounts: [],
    tableRows: 0,
    headingCount: 0,
    rows: [],
  }
  if (usable.length === 0) return empty

  const allWords = usable.flatMap((l) => l.words)
  const medianHeight = median(usable.map((l) => l.bbox.y1 - l.bbox.y0)) || 1
  const wordHeight = (w: OcrWord) => w.bbox.y1 - w.bbox.y0
  const medianWordHeight = median(allWords.map(wordHeight)) || 1
  const charWidth =
    median(allWords.map((w) => (w.bbox.x1 - w.bbox.x0) / Math.max(1, Array.from(w.text).length))) || 1
  const cellGap = charWidth * 3

  // Group lines into visual rows (merges table columns split across blocks)
  const sorted = [...usable].sort(
    (a, b) => (a.bbox.y0 + a.bbox.y1) / 2 - (b.bbox.y0 + b.bbox.y1) / 2,
  )
  const rows: Row[] = []
  for (const line of sorted) {
    const cy = (line.bbox.y0 + line.bbox.y1) / 2
    const last = rows[rows.length - 1]
    const overlapsHorizontally =
      last?.lines.some((l) => line.bbox.x0 < l.bbox.x1 && line.bbox.x1 > l.bbox.x0) ?? true
    if (last && Math.abs(cy - last.centerY) < medianHeight * 0.45 && !overlapsHorizontally) {
      last.lines.push(line)
      last.top = Math.min(last.top, line.bbox.y0)
      last.bottom = Math.max(last.bottom, line.bbox.y1)
    } else {
      rows.push({ lines: [line], top: line.bbox.y0, bottom: line.bbox.y1, centerY: cy })
    }
  }

  const uncertainTokens: OcrUncertainToken[] = []
  const ambiguousAmounts = new Set<string>()
  const outLines: string[] = []
  const rowsOut: Array<{ text: string; plain: string }> = []
  let tableRows = 0
  let headingCount = 0
  let confWeighted = 0
  let confWeight = 0

  // Paragraph breaks: a row pitch clearly larger than the page's typical pitch
  const pitches = rows.slice(1).map((r, i) => r.centerY - rows[i].centerY)
  const medianPitch = median(pitches) || medianHeight * 1.5

  for (const [rowIndex, row] of rows.entries()) {
    const words = row.lines.flatMap((l) => l.words).sort((a, b) => a.bbox.x0 - b.bbox.x0)

    const cells: string[][] = [[]]
    const plainCells: string[][] = [[]]
    for (let i = 0; i < words.length; i++) {
      const w = words[i]
      const prev = words[i - 1]
      if (prev && w.bbox.x0 - prev.bbox.x1 > cellGap) {
        cells.push([])
        plainCells.push([])
      }

      const len = Array.from(w.text).length
      confWeighted += w.confidence * len
      confWeight += len

      const analysis = analyzeToken(w.text, w.confidence, prev?.text)
      let rendered = w.text
      if (analysis.flagged && analysis.reason) {
        // Clause numbers (5.2, 4.1.3) carry no policy value; they are still
        // reported, but an inline marker would make the AI discard valid terms.
        const isClauseNumber = analysis.reason === 'low_confidence' && CLAUSE_NUMBER.test(w.text)
        if (!isClauseNumber) rendered = `${w.text}${UNCERTAIN_MARKER}`
        if (uncertainTokens.length < MAX_UNCERTAIN_TOKENS) {
          uncertainTokens.push({
            text: w.text,
            confidence: Math.round(w.confidence),
            reason: analysis.reason,
          })
        }
        if (analysis.isAmount || analysis.reason === 'confusable_characters') {
          const amountText =
            prev && CURRENCY_WORD.test(prev.text.trim()) ? `${prev.text} ${w.text}` : w.text
          if (ambiguousAmounts.size < MAX_AMBIGUOUS_AMOUNTS) ambiguousAmounts.add(amountText)
        }
      }
      cells[cells.length - 1].push(rendered)
      plainCells[plainCells.length - 1].push(w.text)
    }

    const cellTexts = cells.map((c) => c.join(' ').trim()).filter(Boolean)
    const plainText = plainCells.map((c) => c.join(' ').trim()).filter(Boolean).join(' ')
    const rowWordHeight = median(words.map(wordHeight))

    if (rowIndex > 0 && pitches[rowIndex - 1] > medianPitch * 1.45 && outLines.length > 0) {
      outLines.push('')
    }

    let line: string
    if (cellTexts.length >= 2) {
      tableRows++
      line = `| ${cellTexts.join(' | ')} |`
    } else if (isHeadingRow(plainText, rowWordHeight, medianWordHeight)) {
      headingCount++
      line = `## ${cellTexts[0]}`
    } else {
      line = cellTexts[0] ?? ''
    }

    outLines.push(line)
    rowsOut.push({ text: line, plain: plainText })
  }

  return {
    text: outLines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    wordCount: allWords.length,
    meanConfidence: confWeight ? confWeighted / confWeight : 0,
    uncertainTokens,
    ambiguousAmounts: Array.from(ambiguousAmounts),
    tableRows,
    headingCount,
    rows: rowsOut,
  }
}

/**
 * Flattens Tesseract's block → paragraph → line → word tree into OcrLines and
 * drops pure-punctuation speckle noise.
 */
export function linesFromTesseractBlocks(blocks: any[] | null | undefined): OcrLine[] {
  const lines: OcrLine[] = []
  for (const block of blocks ?? []) {
    for (const para of block?.paragraphs ?? []) {
      for (const line of para?.lines ?? []) {
        const words: OcrWord[] = (line?.words ?? [])
          .map((w: any) => ({
            text: String(w?.text ?? '').trim(),
            confidence: Number(w?.confidence ?? 0),
            bbox: w?.bbox,
          }))
          .filter(
            (w: OcrWord) =>
              w.text.length > 0 &&
              w.bbox &&
              !(w.confidence < 30 && /^[^\p{L}\p{N}₹$%]+$/u.test(w.text)),
          )
        if (words.length > 0) lines.push({ words, bbox: line.bbox })
      }
    }
  }
  return lines
}
