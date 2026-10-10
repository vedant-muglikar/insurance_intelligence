/**
 * Reads the sum insured (coverage amount) from the policy text. The model's answer is only accepted when the same
 * figure is actually printed in the document; otherwise a deterministic scan near "sum insured" is used, and when
 * that is ambiguous the result is null so the app asks the user instead of guessing.
 */

import type { ExtractedPage } from '@/lib/types/policy'

const MULT: Record<string, number> = {
  lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, l: 1e5,
  crore: 1e7, crores: 1e7, cr: 1e7,
  k: 1e3,
}

function toNumber(num: string, unit?: string): number | null {
  const n = parseFloat(num.replace(/,/g, ''))
  if (!Number.isFinite(n)) return null
  const m = unit ? MULT[unit.toLowerCase()] : 1
  return Math.round(n * (m ?? 1))
}

/** Every money-looking figure of 1,000 or more in the text, as whole rupees. */
function figuresIn(text: string): Set<number> {
  const out = new Set<number>()
  for (const m of text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(lakhs?|lacs?|crores?|cr\b|l\b|k\b)?/gi)) {
    const v = toNumber(m[1], m[2])
    if (v !== null && v >= 1000) out.add(v)
  }
  return out
}

export function parseAmount(text?: string | null): number | null {
  if (!text) return null
  const m = /(\d[\d,]*(?:\.\d+)?)\s*(lakhs?|lacs?|crores?|cr\b|l\b)?/i.exec(text)
  return m ? toNumber(m[1], m[2]) : null
}

export interface SumInsuredResult {
  amount: number | null
  source: 'document' | 'document_scan' | null
}

export function resolveSumInsured(pages: ExtractedPage[], llmAmount?: number | null, llmText?: string): SumInsuredResult {
  const text = pages.map((p) => p.text).join('\n')
  const known = figuresIn(text)

  const candidates = [typeof llmAmount === 'number' ? Math.round(llmAmount) : null, parseAmount(llmText)]
  for (const c of candidates) {
    if (c && c >= 1000 && known.has(c)) return { amount: c, source: 'document' }
  }

  // Scan: "Sum Insured ... Rs. 5,00,000" style statements; the most repeated figure wins, ties are not guessed.
  const counts = new Map<number, number>()
  for (const m of text.matchAll(/sum\s+insured[^\n]{0,70}?(?:₹|rs\.?|inr)\s*(\d[\d,]*(?:\.\d+)?)\s*(lakhs?|lacs?|crores?|cr\b)?/gi)) {
    const v = toNumber(m[1], m[2])
    if (v !== null && v >= 10000) counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
  if (ranked.length && (ranked.length === 1 || ranked[0][1] > ranked[1][1])) {
    return { amount: ranked[0][0], source: 'document_scan' }
  }
  return { amount: null, source: null }
}
