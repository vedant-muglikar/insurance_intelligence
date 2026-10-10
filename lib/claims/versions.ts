/**
 * Policy versions: finding a document's effective date, deciding whether it is a base policy or an amendment,
 * choosing which documents are in force on the treatment date, and merging them in a fixed order of precedence.
 *
 * Precedence is decided here, in code. A later amendment in force replaces the base rule on the same topic;
 * a document that is not yet in force on the treatment date is never applied.
 */

import { compilePolicyRules } from '@/lib/policy/compiler'
import type { CompiledRule, ExtractedPage, PolicyAnalysisResult } from '@/lib/types/policy'
import type { MergedRule, PolicyVersion, VersionCandidate, VersionChange, VersionSelection } from './types'

// ─── dates ────────────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
}

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCMonth() !== m - 1) return null
  return `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`
}

/** Parses 01/04/2026, 1-4-2026, 01.04.2026, 2026-04-01, "1st April 2026" and "April 1, 2026". Day first for numeric forms. */
export function parseDateToken(raw: string): string | null {
  const s = raw.trim().replace(/,/g, ' ').replace(/\s+/g, ' ')
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (m) return iso(+m[1], +m[2], +m[3])
  m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(s)
  if (m) return iso(+m[3], +m[2], +m[1])
  m = /^(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]{3,9})\s+(\d{4})$/.exec(s)
  if (m && MONTHS[m[2].toLowerCase()]) return iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1])
  m = /^([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})$/.exec(s)
  if (m && MONTHS[m[1].toLowerCase()]) return iso(+m[3], MONTHS[m[1].toLowerCase()], +m[2])
  return null
}

const DATE_PATTERN =
  '(\\d{1,2}[\\/\\-.]\\d{1,2}[\\/\\-.]\\d{4}|\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?[A-Za-z]{3,9},?\\s+\\d{4}|[A-Za-z]{3,9}\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4})'

const EFFECTIVE_CUES = [
  'effective\\s+(?:from|date|on)',
  'with\\s+effect\\s+from',
  'w\\.?\\s?e\\.?\\s?f\\.?',
  'date\\s+of\\s+commencement',
  'comes?\\s+into\\s+(?:force|effect)\\s+on',
  'shall\\s+(?:come\\s+into\\s+(?:force|effect)|apply|be\\s+applicable)\\s+(?:from|on)',
  'applicable\\s+(?:from|to\\s+claims?\\s+(?:with\\s+admission\\s+)?(?:on\\s+or\\s+)?after)',
  'on\\s+or\\s+after',
]

export interface EffectiveDate {
  date: string | null
  evidence?: { page: number | null; quote: string }
}

/** Finds the first "effective from <date>" style statement. Returns null date when none is printed, never a guess. */
export function extractEffectiveDate(pages: ExtractedPage[]): EffectiveDate {
  const re = new RegExp(`(?:${EFFECTIVE_CUES.join('|')})[^0-9A-Za-z]{0,24}${DATE_PATTERN}`, 'i')
  for (const p of pages) {
    const m = re.exec(p.text)
    if (!m) continue
    const date = parseDateToken(m[m.length - 1])
    if (!date) continue
    const start = Math.max(0, m.index - 60)
    return { date, evidence: { page: p.page_number, quote: p.text.slice(start, m.index + m[0].length + 40).trim() } }
  }
  return { date: null }
}

export function detectDocumentKind(documentName: string, pages: ExtractedPage[]): 'base' | 'amendment' {
  const head = `${documentName} ${pages[0]?.text.slice(0, 500) ?? ''}`
  return /\b(amend\w*|endorse\w*|addend\w*|supplement\w*|revis\w*)\b/i.test(head) ? 'amendment' : 'base'
}

// ─── building versions ────────────────────────────────────────────────────────

export function makeVersion(args: {
  id: string
  label?: string
  documentName: string
  result: PolicyAnalysisResult
  kind?: 'base' | 'amendment'
  effectiveFrom?: string | null
  effectiveTo?: string | null
  synthetic?: boolean
}): PolicyVersion {
  const { result } = args
  const kind = args.kind ?? detectDocumentKind(args.documentName, result.pages)
  const found = extractEffectiveDate(result.pages)
  const compiled = result.compiled_rules?.length ? result.compiled_rules : compilePolicyRules(result.rules, result.pages)
  return {
    id: args.id,
    label: args.label ?? (kind === 'base' ? 'Base policy' : 'Amendment'),
    kind,
    documentName: args.documentName,
    uin: result.overview.uin ?? null,
    effectiveFrom: args.effectiveFrom !== undefined ? args.effectiveFrom : found.date,
    effectiveFromEvidence: args.effectiveFrom !== undefined ? undefined : found.evidence,
    effectiveTo: args.effectiveTo ?? null,
    rules: result.rules,
    compiled,
    pages: result.pages,
    synthetic: args.synthetic,
  }
}

// ─── merging ──────────────────────────────────────────────────────────────────

const SINGLETON_TYPES = new Set(['SUM_INSURED', 'DEDUCTIBLE', 'ROOM_LIMIT'])
const NAME_STOP = new Set(['the', 'and', 'for', 'policy', 'clause', 'revised', 'amended', 'new', 'endorsement', 'of', 'to', 'in'])

function nameTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !NAME_STOP.has(t) && !/^\d+$/.test(t)),
  )
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / (a.size + b.size - inter)
}

/** Do two compiled rules speak to the same topic, so that the later one should replace the earlier one? */
export function sameTopic(a: CompiledRule, b: CompiledRule): boolean {
  if (a.ruleType !== b.ruleType) return false
  if (SINGLETON_TYPES.has(a.ruleType)) return true
  return jaccard(nameTokens(a.ruleName), nameTokens(b.ruleName)) >= 0.5
}

export function summarizeRule(r: CompiledRule): string {
  const e = r.effect
  const bits: string[] = []
  if (e.capAmount) bits.push(`cap ₹${e.capAmount.toLocaleString('en-IN')}`)
  else if (e.amount) bits.push(`₹${e.amount.toLocaleString('en-IN')}`)
  if (e.percentage) bits.push(`${e.percentage}%`)
  if (e.action === 'deny') bits.push('not payable')
  if (e.action === 'proration') bits.push('proportionate deduction')
  if (e.action === 'allow' && !bits.length) bits.push('payable')
  return bits.length ? bits.join(', ') : r.ruleName
}

/** The clause as written: its name, value and description. Used to link bill items to the clause. */
function ruleText(v: PolicyVersion, rule: CompiledRule): string {
  const raw = v.rules.find((r) => r.id === rule.id)
  return [rule.ruleName, raw?.value, raw?.description, rule.effect?.description].filter(Boolean).join('. ')
}

// ─── selection ────────────────────────────────────────────────────────────────

/**
 * Chooses the documents in force on the treatment date and merges them.
 *  - The base is the latest base document that had started by the treatment date (else the earliest base).
 *  - An amendment applies only when its effective date is known and not after the treatment date.
 *  - An amendment with no readable effective date is NOT applied; a warning asks for review.
 *  - Amendments apply in order of effective date. A later one replaces an earlier rule on the same topic.
 */
export function selectVersion(versions: PolicyVersion[], treatmentDate: string | null): VersionSelection {
  const warnings: string[] = []
  const candidates: VersionCandidate[] = []
  const bases = versions.filter((v) => v.kind === 'base')
  const amendments = versions.filter((v) => v.kind === 'amendment')

  if (!bases.length) {
    return {
      treatmentDate,
      candidates: [],
      inForce: [],
      rules: [],
      changes: [],
      warnings: ['No base policy document is loaded, so no rules can be applied.'],
    }
  }

  const byDate = (a: PolicyVersion, b: PolicyVersion) => (a.effectiveFrom ?? '').localeCompare(b.effectiveFrom ?? '')
  const startedBases = bases.filter((b) => !treatmentDate || !b.effectiveFrom || b.effectiveFrom <= treatmentDate).sort(byDate)
  const base = startedBases.length ? startedBases[startedBases.length - 1] : [...bases].sort(byDate)[0]

  if (treatmentDate && base.effectiveFrom && base.effectiveFrom > treatmentDate) {
    warnings.push(
      `The treatment date ${treatmentDate} is before the base policy's effective date ${base.effectiveFrom}. The claim may fall outside the policy period.`,
    )
  }
  if (!treatmentDate) {
    warnings.push('No treatment date was given, so only the base policy is applied. Add the date to apply amendments.')
  }

  for (const b of bases) {
    candidates.push({
      id: b.id,
      label: b.label,
      kind: 'base',
      effectiveFrom: b.effectiveFrom,
      inForce: b.id === base.id,
      reason: b.id === base.id ? 'Base policy for this treatment date.' : 'A different base document; not the one in force.',
    })
  }

  const inForceAmendments: PolicyVersion[] = []
  for (const a of [...amendments].sort(byDate)) {
    let inForce = false
    let reason: string
    if (!a.effectiveFrom) {
      reason = 'No effective date could be read from this document, so it is not applied. Review it and enter the date.'
      warnings.push(`${a.label}: no effective date found, so it was not applied.`)
    } else if (!treatmentDate) {
      reason = 'Not applied because there is no treatment date to compare with.'
    } else if (a.effectiveFrom > treatmentDate) {
      reason = `Takes effect on ${a.effectiveFrom}, after the treatment date ${treatmentDate}.`
    } else if (a.effectiveTo && a.effectiveTo < treatmentDate) {
      reason = `Ended on ${a.effectiveTo}, before the treatment date ${treatmentDate}.`
    } else {
      inForce = true
      reason = `In force: effective ${a.effectiveFrom}, on or before the treatment date ${treatmentDate}.`
      inForceAmendments.push(a)
    }
    candidates.push({ id: a.id, label: a.label, kind: 'amendment', effectiveFrom: a.effectiveFrom, inForce, reason })
  }

  const merged: MergedRule[] = base.compiled.map((rule) => ({ rule, versionId: base.id, versionLabel: base.label, origin: 'base' as const, text: ruleText(base, rule) }))
  const changes: VersionChange[] = []

  for (const a of inForceAmendments) {
    for (const rule of a.compiled) {
      if (rule.usability === 'explanatory_only' && rule.ruleType === 'CLAIM_REQUIREMENT') continue
      const idx = merged.findIndex((m) => sameTopic(m.rule, rule))
      if (idx >= 0) {
        const prev = merged[idx]
        merged[idx] = {
          rule,
          versionId: a.id,
          versionLabel: a.label,
          origin: 'amendment',
          text: ruleText(a, rule),
          supersedes: { versionId: prev.versionId, ruleId: prev.rule.id, ruleName: prev.rule.ruleName },
        }
        changes.push({
          kind: 'replaced',
          amendmentId: a.id,
          amendmentLabel: a.label,
          ruleName: rule.ruleName,
          ruleType: rule.ruleType,
          previousName: prev.rule.ruleName,
          previousSummary: summarizeRule(prev.rule),
          newSummary: summarizeRule(rule),
        })
      } else {
        merged.push({ rule, versionId: a.id, versionLabel: a.label, origin: 'amendment', text: ruleText(a, rule) })
        changes.push({
          kind: 'added',
          amendmentId: a.id,
          amendmentLabel: a.label,
          ruleName: rule.ruleName,
          ruleType: rule.ruleType,
          newSummary: summarizeRule(rule),
        })
      }
    }
  }

  return {
    treatmentDate,
    candidates,
    inForce: [base.id, ...inForceAmendments.map((a) => a.id)],
    rules: merged,
    changes,
    warnings,
  }
}
