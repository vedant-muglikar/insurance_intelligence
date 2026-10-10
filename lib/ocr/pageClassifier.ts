/**
 * Per-page decision: is the embedded text layer good enough, or does the page
 * need OCR? Pure functions — no PDF or OCR dependencies — so they are unit-testable.
 */

export type PageRoute = 'text_layer' | 'ocr' | 'hybrid'

export interface TextLayerAssessment {
  charCount: number
  wordCount: number
  /** Share of characters that are letters, digits, whitespace or common punctuation (0–1) */
  validCharRatio: number
  /** Share of words that look like real words/numbers (0–1) */
  plausibleWordRatio: number
  garbled: boolean
}

export interface PageImageInfo {
  /** Share of the page area painted by raster images (0–1) */
  imageCoverage: number
  imageCount: number
  /** Lowest effective resolution among large images, if any */
  minImageDpi: number | null
}

export interface PageClassification {
  route: PageRoute
  reason: string
}

// Letters (any script), digits, whitespace, and punctuation common in policy wordings.
const VALID_CHAR = /[\p{L}\p{N}\s.,;:()\[\]{}\/\\%&@#*+=<>!?'"`~^|_\-–—•·₹$€£°§©®™’‘“”…]/u

export function assessTextLayer(text: string): TextLayerAssessment {
  const chars = Array.from(text)
  const charCount = chars.length
  if (charCount === 0) {
    return { charCount: 0, wordCount: 0, validCharRatio: 0, plausibleWordRatio: 0, garbled: false }
  }

  const validChars = chars.filter((c) => VALID_CHAR.test(c)).length
  const validCharRatio = validChars / charCount

  const words = text.split(/\s+/).filter(Boolean)
  // A plausible token has a vowel (words), digits (numbers/clauses), or is short punctuation.
  const plausible = words.filter(
    (w) => w.length <= 30 && (/[aeiouyAEIOUY]/.test(w) || /\d/.test(w) || /^[^\p{L}\p{N}]{1,3}$/u.test(w) || /[^\x00-\x7F]/.test(w)),
  ).length
  const plausibleWordRatio = words.length ? plausible / words.length : 0

  // Broken ToUnicode maps typically produce control chars / private-use glyphs or
  // vowel-less consonant soup. Only judge pages with enough text to be meaningful.
  const garbled = charCount >= 40 && (validCharRatio < 0.8 || plausibleWordRatio < 0.5)

  return { charCount, wordCount: words.length, validCharRatio, plausibleWordRatio, garbled }
}

/**
 * Decide how a page should be extracted.
 *
 * - Little or no embedded text → OCR (scanned page or text drawn as outlines)
 * - Embedded text present but garbled (bad font encoding) → OCR replaces it
 * - Good embedded text but large raster images and modest text volume → hybrid
 *   (e.g. a typed page with a scanned schedule/table pasted in)
 * - Otherwise → existing text-layer extraction only
 */
export function classifyPage(
  text: string,
  images: PageImageInfo,
  minTextChars: number,
): PageClassification {
  const a = assessTextLayer(text)
  const coveragePct = Math.round(images.imageCoverage * 100)

  if (a.charCount < minTextChars) {
    return {
      route: 'ocr',
      reason:
        a.charCount === 0
          ? images.imageCount > 0
            ? `No embedded text; images cover ${coveragePct}% of the page (scanned page)`
            : 'No embedded text layer'
          : `Only ${a.charCount} characters in the embedded text layer`,
    }
  }

  if (a.garbled) {
    return {
      route: 'ocr',
      reason: `Embedded text appears garbled (${Math.round(a.validCharRatio * 100)}% valid characters) — likely a broken font encoding`,
    }
  }

  if (images.imageCoverage >= 0.3 && a.charCount < 1500) {
    return {
      route: 'hybrid',
      reason: `Embedded text found, but images cover ${coveragePct}% of the page and may contain additional text`,
    }
  }

  return { route: 'text_layer', reason: `Embedded text layer with ${a.charCount} characters` }
}
