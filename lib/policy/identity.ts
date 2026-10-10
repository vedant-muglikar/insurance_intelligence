/**
 * Document identity: the IRDAI Unique Identification Number (UIN), a content hash, and a similarity check.
 *
 * The UIN already carries the product version (for example ...V012021 is version 01 of the 2021 filing), so two
 * versions of a product with the same name have different UINs and never share a saved analysis. Rules are only
 * reused when the UIN matches exactly AND the document text is the same document, never on name alone.
 */

import { createHash } from 'crypto'
import type { ExtractedPage } from '@/lib/types/policy'

/** Bump when the extraction prompt or rule shape changes, so stale saved analyses are not reused. */
export const EXTRACTION_VERSION = 2

// Insurer code (3+ letters), product code, serial, then V + 2-digit version + 4 to 6 digit year block.
const UIN_SHAPE = /[A-Z]{3}[A-Z0-9]{4,16}V\d{2}\d{4,6}/g
const UIN_LABELLED = /\b(?:UIN|U\.I\.N\.?|Unique\s+Identification\s+(?:No\.?|Number))\s*[:\-–#.]?\s*([A-Z0-9][A-Z0-9 \-]{9,40})/gi

export function normalizeUin(raw: string): string {
  return raw.toUpperCase().replace(/[\s\-_/.]/g, '')
}

function shapesIn(text: string): string[] {
  return normalizeUin(text).match(UIN_SHAPE) ?? []
}

export interface UinResult {
  uin: string | null
  /** 'labelled' when printed next to a "UIN" label, 'pattern' when found by shape alone. */
  basis: 'labelled' | 'pattern' | null
  /** True when several different UINs competed and none clearly won; the caller must not trust it. */
  ambiguous: boolean
  candidates: Array<{ uin: string; count: number }>
}

/** Finds the product UIN. Footers repeat it on most pages, so the most frequent candidate wins. */
export function extractUin(pages: ExtractedPage[], llmGuess?: string): UinResult {
  const counts = new Map<string, number>()
  const labelled = new Set<string>()

  for (const page of pages) {
    for (const m of page.text.matchAll(UIN_LABELLED)) {
      const u = shapesIn(m[1])[0] // only the UIN straight after the label, not whatever follows it
      if (u) {
        counts.set(u, (counts.get(u) ?? 0) + 2)
        labelled.add(u)
      }
    }
    // Shape-only matches run on lines, so a UIN printed without a label is still found.
    for (const line of page.text.split('\n')) {
      for (const m of line.matchAll(/\b[A-Z]{3}[A-Z0-9]{4,16}V\d{6,8}\b/g)) {
        const u = normalizeUin(m[0])
        counts.set(u, (counts.get(u) ?? 0) + 1)
      }
    }
  }

  // A model-suggested UIN is accepted only if it has the right shape and is printed in the document.
  if (llmGuess) {
    const g = normalizeUin(llmGuess)
    const whole = normalizeUin(pages.map((p) => p.text).join(' '))
    if (/^[A-Z]{3}[A-Z0-9]{4,16}V\d{6,8}$/.test(g) && whole.includes(g)) counts.set(g, (counts.get(g) ?? 0) + 1)
  }

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([uin, count]) => ({ uin, count }))
  if (ranked.length === 0) return { uin: null, basis: null, ambiguous: false, candidates: [] }

  const [top, second] = ranked
  if (second && top.count < second.count * 1.5) {
    return { uin: null, basis: null, ambiguous: true, candidates: ranked.slice(0, 5) }
  }
  return {
    uin: top.uin,
    basis: labelled.has(top.uin) ? 'labelled' : 'pattern',
    ambiguous: false,
    candidates: ranked.slice(0, 5),
  }
}

function words(pages: ExtractedPage[]): string[] {
  return pages
    .map((p) => p.text)
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9₹% ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/** SHA-256 of the whitespace- and case-normalised text of the whole document. */
export function documentHash(pages: ExtractedPage[]): string {
  return createHash('sha256').update(words(pages).join(' ')).digest('hex')
}

function shingles(ws: string[], n = 4): Set<string> {
  const out = new Set<string>()
  for (let i = 0; i + n <= ws.length; i++) out.add(ws.slice(i, i + n).join(' '))
  return out
}

/** Jaccard similarity of 4-word shingles, 0 to 1. Re-extractions of one PDF score near 1. */
export function textSimilarity(a: ExtractedPage[], b: ExtractedPage[]): number {
  const A = shingles(words(a))
  const B = shingles(words(b))
  if (A.size === 0 || B.size === 0) return 0
  let inter = 0
  for (const s of A) if (B.has(s)) inter++
  return inter / (A.size + B.size - inter)
}
