/**
 * PolicyLens - Deterministic Normalizers (Blueprint Section 10 & 15)
 * Pure helper functions for parsing currency, percentages, durations,
 * room categories, dates, and canonical medical tags.
 */

// ─── Currency Normalization ──────────────────────────────────────────────────

/**
 * Parses Indian currency strings into numeric amounts.
 * Examples: "₹5,00,000", "Rs 2 Lakh", "2.5L", "50000", "5 Cr", "1% of Sum Insured" (leaves base handling to caller)
 */
export function parseCurrency(val: string | null | undefined): number | null {
  if (!val) return null

  const clean = val.toLowerCase().replace(/,/g, '').trim()

  // Handle Lakh / L
  const lakhMatch = clean.match(/([\d.]+)\s*(?:lakhs?|lacs?|lac|l\b)/)
  if (lakhMatch) {
    const num = parseFloat(lakhMatch[1])
    return isNaN(num) ? null : Math.round(num * 100000)
  }

  // Handle Crore / Cr
  const crMatch = clean.match(/([\d.]+)\s*(?:crores?|cr\b)/)
  if (crMatch) {
    const num = parseFloat(crMatch[1])
    return isNaN(num) ? null : Math.round(num * 10000000)
  }

  // Handle direct numeric matches (e.g. ₹50000, 25000)
  const numMatch = clean.match(/(?:(?:rs\.?|inr|₹)\s*)?(\d+(?:\.\d+)?)/)
  if (numMatch) {
    const num = parseFloat(numMatch[1])
    return isNaN(num) ? null : Math.round(num)
  }

  return null
}

export function formatINR(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) return '₹0'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Math.round(amount))
}

// ─── Percentage Normalization ────────────────────────────────────────────────

export function parsePercentage(val: string | null | undefined): number | null {
  if (!val) return null
  const clean = val.toLowerCase()
  const match = clean.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)/)
  if (match) {
    const num = parseFloat(match[1])
    return isNaN(num) ? null : num
  }
  return null
}

// ─── Duration Normalization ──────────────────────────────────────────────────

export interface ParsedDuration {
  months: number
  days: number
  rawText: string
}

export function parseDuration(val: string | null | undefined): ParsedDuration | null {
  if (!val) return null
  const clean = val.toLowerCase()

  // Years (e.g. "2 years", "4 yr")
  const yearMatch = clean.match(/(\d+)\s*(?:years?|yrs?|yr)/)
  if (yearMatch) {
    const yrs = parseInt(yearMatch[1], 10)
    return { months: yrs * 12, days: yrs * 365, rawText: val }
  }

  // Months (e.g. "24 months", "36 mos", "1 month")
  const monthMatch = clean.match(/(\d+)\s*(?:months?|mos?|mo\b)/)
  if (monthMatch) {
    const mos = parseInt(monthMatch[1], 10)
    return { months: mos, days: mos * 30, rawText: val }
  }

  // Days (e.g. "30 days", "90 d")
  const dayMatch = clean.match(/(\d+)\s*(?:days?|d\b)/)
  if (dayMatch) {
    const days = parseInt(dayMatch[1], 10)
    return { months: Math.round(days / 30), days, rawText: val }
  }

  return null
}

// ─── Room Category Normalization ─────────────────────────────────────────────

export type CanonicalRoomType = 'general' | 'twin-sharing' | 'single-private' | 'suite' | 'icu'

export const ROOM_TIER_RANK: Record<CanonicalRoomType, number> = {
  general: 1,
  'twin-sharing': 2,
  'single-private': 3,
  suite: 4,
  icu: 5,
}

export function normalizeRoomCategory(raw: string | null | undefined): CanonicalRoomType {
  if (!raw) return 'single-private'
  const text = raw.toLowerCase()

  if (text.includes('icu') || text.includes('intensive care') || text.includes('ccu') || text.includes('hdü')) {
    return 'icu'
  }
  if (text.includes('suite') || text.includes('deluxe') || text.includes('super deluxe') || text.includes('presidential')) {
    return 'suite'
  }
  if (text.includes('single') || text.includes('private')) {
    return 'single-private'
  }
  if (text.includes('twin') || text.includes('sharing') || text.includes('semi-private') || text.includes('double')) {
    return 'twin-sharing'
  }
  if (text.includes('general') || text.includes('economy') || text.includes('ward')) {
    return 'general'
  }

  return 'single-private'
}

// ─── Date Arithmetic ─────────────────────────────────────────────────────────

export function calculateDateDiffDays(startDateStr: string, endDateStr: string): number {
  const start = new Date(startDateStr)
  const end = new Date(endDateStr)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0
  const diffTime = end.getTime() - start.getTime()
  return Math.floor(diffTime / (1000 * 60 * 60 * 24))
}

export function calculateDateDiffMonths(startDateStr: string, endDateStr: string): number {
  const start = new Date(startDateStr)
  const end = new Date(endDateStr)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
}

export function addMonthsToDate(dateStr: string, monthsToAdd: number): string {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  d.setMonth(d.getMonth() + monthsToAdd)
  return d.toISOString().split('T')[0]
}

export function addDaysToDate(dateStr: string, daysToAdd: number): string {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  d.setDate(d.getDate() + daysToAdd)
  return d.toISOString().split('T')[0]
}

export function formatDateIndian(dateStr?: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

// ─── Medical Token & Canonical Mapping ───────────────────────────────────────

export const CANONICAL_PROCEDURES = [
  { key: 'appendectomy', label: 'Appendectomy', aliases: ['appendix', 'appendicitis', 'laparoscopic appendectomy'] },
  { key: 'knee_replacement', label: 'Total Knee Replacement', aliases: ['knee surgery', 'tkr', 'knee arthroplasty', 'knee implant', 'joint replacement'] },
  { key: 'hip_replacement', label: 'Hip Replacement', aliases: ['thr', 'hip arthroplasty', 'hip surgery', 'joint replacement'] },
  { key: 'cataract', label: 'Cataract Surgery', aliases: ['cataract', 'phaco', 'phacoemulsification', 'iol', 'eye lens'] },
  { key: 'cholecystectomy', label: 'Cholecystectomy (Gallbladder)', aliases: ['gallbladder', 'gall stones', 'lap chole'] },
  { key: 'hernia_repair', label: 'Hernia Repair', aliases: ['inguinal hernia', 'umbilical hernia', 'hernioplasty', 'hernia mesh'] },
  { key: 'angioplasty', label: 'Coronary Angioplasty (PTCA)', aliases: ['ptca', 'heart stent', 'coronary stent', 'cardiac stent', 'angioplasty'] },
  { key: 'cabg', label: 'Coronary Artery Bypass (CABG)', aliases: ['bypass surgery', 'open heart', 'heart bypass'] },
  { key: 'maternity_normal', label: 'Maternity (Normal Delivery)', aliases: ['normal delivery', 'vaginal delivery', 'childbirth', 'pregnancy'] },
  { key: 'maternity_csection', label: 'Maternity (C-Section)', aliases: ['c-section', 'caesarean', 'cesarean delivery'] },
  { key: 'hemodialysis', label: 'Hemodialysis (Per Session)', aliases: ['dialysis', 'kidney dialysis', 'renal dialysis'] },
  { key: 'kidney_stone', label: 'Kidney Stone Removal (PCNL / URSL)', aliases: ['kidney stone', 'renal calculi', 'ursl', 'pcnl', 'lithotripsy'] },
  { key: 'tonsillectomy', label: 'Tonsillectomy / Adenoidectomy', aliases: ['tonsils', 'tonsil removal', 'adenoids', 'ent surgery'] },
  { key: 'hysterectomy', label: 'Hysterectomy (Uterus Removal)', aliases: ['uterus removal', 'fibroid uterus', 'lap hysterectomy'] },
  { key: 'dengue_treatment', label: 'Dengue Inpatient Treatment', aliases: ['dengue fever', 'platelet transfusion', 'dengue medical management'] },
  { key: 'chemotherapy', label: 'Chemotherapy Cycle', aliases: ['chemo', 'oncology chemo', 'cancer chemotherapy'] },
]

export function getCanonicalProcedureKey(name: string): string {
  const clean = name.toLowerCase().trim()
  for (const proc of CANONICAL_PROCEDURES) {
    if (clean === proc.key || clean === proc.label.toLowerCase()) return proc.key
    for (const alias of proc.aliases) {
      if (clean.includes(alias) || alias.includes(clean)) {
        return proc.key
      }
    }
  }
  return clean.replace(/\s+/g, '_')
}
