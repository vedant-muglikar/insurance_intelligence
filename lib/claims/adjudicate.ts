/**
 * Item-level claim adjudication. Pure TypeScript, whole rupees, no model in the arithmetic.
 *
 * Order of stages is fixed and follows the compiled rule precedence:
 *   0  version     which documents are in force on the treatment date, merged in precedence order
 *   1  waiting     a waiting period that has not elapsed (calendar months from the policy start) makes the whole bill non-payable
 *   1b treatment   an exclusion clause naming the treatment itself makes the whole bill non-payable
 *   2  exclusion   items an exclusion clause covers become non-payable; conflicting or missing evidence is held
 *   3  room_rent   room cap per day, with proportionate reduction of associated charges when the clause says so
 *   4  sub_limit   capped groups of items, reduced pro rata
 *   5  deductible  once, over the remaining payable amount, pro rata
 *   6  copay       once, over what remains after the deductible, if its age condition is met
 *   7  sum_insured the available sum insured caps the total, pro rata
 *
 * Each stage reads the running payable amount of each item, so an item that an earlier stage already removed
 * cannot be reduced again, and no stage runs twice for one item. adjudicate() ends with checks that prove it.
 */

import type { HospitalBill, HospitalBillLineItem } from '@/lib/types/bill'
import type { CompiledRule } from '@/lib/types/policy'
import { addDaysToDate, addMonthsToDate } from '@/lib/policy/normalizers'
import { keywordMatcher } from './matcher'
import { decideOutcome } from './decide'
import { selectVersion } from './versions'
import type {
  AdjudicationResult,
  ClauseMatch,
  ClauseMatcher,
  ClauseRef,
  DeductionStage,
  ItemStatus,
  LedgerDeduction,
  LedgerItem,
  MergedRule,
  PolicyVersion,
  TraceStep,
} from './types'

export interface AdjudicationInput {
  items: HospitalBillLineItem[]
  bill?: Pick<HospitalBill, 'diagnosis' | 'admissionDate' | 'dischargeDate' | 'hospitalName'>
  versions: PolicyVersion[]
  treatmentDate?: string | null
  patientAge?: number | null
  policyStartDate?: string | null
  availableSumInsured?: number | null
  /** Rupee rate per day of the room the policy entitles the patient to, when the policy names a category but no amount. */
  entitledRoomRatePerDay?: number | null
  /**
   * Canonical procedure key of the treatment (e.g. "cataract"). A waiting period or exclusion whose appliesTo names
   * it covers every item of the bill. Sub-limits are not widened by it: they cap the items they name.
   */
  treatmentKey?: string | null
  /** Pre-existing conditions the patient declared. A pre-existing-disease waiting period applies when any are declared. */
  declaredPED?: string[] | null
  matcher?: ClauseMatcher
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`

/** Splits `total` across `weights` in whole rupees so the parts add up exactly (largest remainder). */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (total <= 0 || sum <= 0) return weights.map(() => 0)
  const t = Math.min(total, sum)
  const raw = weights.map((w) => (t * w) / sum)
  const out = raw.map(Math.floor)
  let rem = t - out.reduce((a, b) => a + b, 0)
  const order = raw.map((r, i) => ({ i, f: r - out[i] })).sort((a, b) => b.f - a.f || a.i - b.i)
  for (let k = 0; rem > 0 && k < order.length; k++, rem--) out[order[k].i]++
  return out.map((v, i) => Math.min(v, weights[i]))
}

function clauseRef(m: MergedRule): ClauseRef {
  return {
    ruleId: m.rule.id,
    ruleName: m.rule.ruleName,
    versionId: m.versionId,
    versionLabel: m.versionLabel,
    page: m.rule.evidence.page,
    section: m.rule.evidence.section,
    quote: m.rule.evidence.quote,
  }
}

function daysBetween(a: string, b: string): number {
  return Math.floor((Date.parse(b) - Date.parse(a)) / 86400000)
}

/** The date a waiting period ends: calendar months (or days) from the policy start. Null when the clause gives neither. */
export function waitingCompletionDate(policyStart: string, period: NonNullable<CompiledRule['effectivePeriod']>): string | null {
  if (period.months) return addMonthsToDate(policyStart, period.months)
  if (period.days) return addDaysToDate(policyStart, period.days)
  return null
}

export interface WaitingContext {
  /** Diagnosis and treatment wording the clause is matched against */
  text: string
  accident: boolean
  treatmentKey?: string | null
  declaredPED?: string[] | null
  matcher: ClauseMatcher
}

/** Whether a waiting-period clause applies to this treatment. The estimator's timeline uses the same test. */
export function waitingApplies(m: MergedRule, ctx: WaitingContext): boolean {
  const p = m.rule.effectivePeriod
  if (!p) return false
  if (p.type === 'initial') return !ctx.accident
  if (ctx.treatmentKey && m.rule.appliesTo.includes(ctx.treatmentKey)) return true
  if ((p.type === 'ped' || m.rule.appliesTo.includes('ped')) && ctx.declaredPED?.length) return true
  return ctx.matcher.match({ text: ctx.text, category: 'surgery', rules: [m] }).length > 0
}

const ACCIDENT_WORDS = /accident|injur|trauma/i
const IMPLANT_WORDS = /\b(implants?|prosthes[ie]s|stents?|bone cement|medical devices?)\b/i
/** Charges a health policy pays by default; excluding one needs more than a single shared word */
const CORE_CATEGORIES = new Set<string>(['room', 'icu', 'surgery', 'doctor', 'implant', 'diagnostics', 'medicines'])

/** What waiting-period clauses are tested against: the diagnosis and the treatment items' wording. */
export function waitingContext(input: AdjudicationInput): WaitingContext {
  const text = [input.bill?.diagnosis, ...input.items.filter((i) => ['surgery', 'doctor', 'implant'].includes(i.category)).map((i) => i.description)]
    .filter(Boolean)
    .join(' ')
  return {
    text,
    accident: ACCIDENT_WORDS.test(text),
    treatmentKey: input.treatmentKey ?? null,
    declaredPED: input.declaredPED,
    matcher: input.matcher ?? keywordMatcher,
  }
}

const ROOM_WORDS = /room|bed|ward|suite|accommodation|ccu|icu/i
const NURSING_WORDS = /nursing|rmo|care|monitor/i

export function isRoomRent(i: HospitalBillLineItem): boolean {
  return (i.category === 'room' || i.category === 'icu') && ROOM_WORDS.test(i.description) && !NURSING_WORDS.test(i.description)
}

export function roomDaysAndRate(i: HospitalBillLineItem): { days: number; rate: number } {
  if (i.quantity > 1 && Math.abs(i.quantity * i.unitPrice - i.amount) <= 1) return { days: i.quantity, rate: i.unitPrice }
  const m = /(\d+)\s*(?:days?|nights?)/i.exec(i.description)
  const days = m ? Math.max(1, parseInt(m[1], 10)) : 1
  return { days, rate: Math.round(i.amount / days) }
}

interface Work {
  item: HospitalBillLineItem
  payable: number
  deductions: LedgerDeduction[]
  review: string[]
  matches: ClauseMatch[]
  held: number
}

export function adjudicate(input: AdjudicationInput): AdjudicationResult {
  const matcher = input.matcher ?? keywordMatcher
  const treatmentDate = input.treatmentDate ?? input.bill?.admissionDate ?? null
  const treatmentKey = input.treatmentKey ?? null
  const treatmentLabel = treatmentKey?.replace(/_/g, ' ') ?? ''
  const selection = selectVersion(input.versions, treatmentDate)
  const rules = selection.rules
  const warnings: string[] = [...selection.warnings]
  const trace: TraceStep[] = []

  const work: Work[] = input.items.map((item) => ({
    item,
    payable: Math.max(0, Math.round(item.amount)),
    deductions: [],
    review: [],
    matches: [],
    held: 0,
  }))
  const claimed = work.reduce((a, w) => a + w.payable, 0)
  const total = () => work.reduce((a, w) => a + w.payable, 0)

  /** Records a deduction. One entry per stage per item: a second call for the same stage merges into it. */
  function deduct(w: Work, stage: DeductionStage, amount: number, formula: string, clause?: ClauseRef) {
    const amt = Math.min(Math.max(0, Math.round(amount)), w.payable)
    if (amt <= 0) return 0
    w.payable -= amt
    const existing = w.deductions.find((d) => d.stage === stage)
    if (existing) {
      existing.amount += amt
      existing.formula += ` + ${formula}`
      if (clause && !existing.clauses.some((c) => c.ruleId === clause.ruleId && c.versionId === clause.versionId)) existing.clauses.push(clause)
    } else {
      w.deductions.push({ stage, amount: amt, formula, clauses: clause ? [clause] : [] })
    }
    return amt
  }

  function step(stage: TraceStep['stage'], title: string, formula: string, before: number, perItem: Array<{ w: Work; amount: number }>, clause?: ClauseRef) {
    const moved = perItem.filter((p) => p.amount > 0)
    const deducted = moved.reduce((a, p) => a + p.amount, 0)
    trace.push({
      stage,
      title,
      formula,
      clause,
      totalBefore: before,
      deducted,
      totalAfter: before - deducted,
      perItem: moved.map((p) => ({ itemId: p.w.item.id, description: p.w.item.description, amount: p.amount })),
    })
  }

  // ── start + version ─────────────────────────────────────────────────────────
  trace.push({
    stage: 'start',
    title: 'Claimed amount',
    formula: `${work.length} bill items add up to ${inr(claimed)}`,
    totalBefore: claimed,
    deducted: 0,
    totalAfter: claimed,
  })
  trace.push({
    stage: 'version',
    title: 'Policy documents in force',
    formula: treatmentDate
      ? `Treatment date ${treatmentDate}. Applied: ${selection.candidates.filter((c) => c.inForce).map((c) => c.label).join(' + ') || 'none'}.${treatmentKey ? ` Treatment recognised as ${treatmentLabel}.` : ''}`
      : `No treatment date. Base policy only.${treatmentKey ? ` Treatment recognised as ${treatmentLabel}.` : ''}`,
    totalBefore: claimed,
    deducted: 0,
    totalAfter: claimed,
  })

  // ── 1. waiting period ───────────────────────────────────────────────────────
  const waitingRules = rules.filter((m) => m.rule.ruleType === 'WAITING_PERIOD' && m.rule.effectivePeriod)
  if (waitingRules.length) {
    const ctx = waitingContext(input)
    for (const m of waitingRules) {
      if (!waitingApplies(m, ctx)) continue
      if (!input.policyStartDate || !treatmentDate) {
        warnings.push(`Waiting period "${m.rule.ruleName}" may apply to this treatment, but the policy start date or treatment date is missing, so it was not applied.`)
        continue
      }
      const ends = waitingCompletionDate(input.policyStartDate, m.rule.effectivePeriod!)
      if (!ends || treatmentDate >= ends) continue
      const elapsed = daysBetween(input.policyStartDate, treatmentDate)
      const before = total()
      const ref = clauseRef(m)
      const per = work.map((w) => ({ w, amount: deduct(w, 'waiting_period', w.payable, `Policy is ${elapsed} days old; ${m.rule.ruleName} runs until ${ends}`, ref) }))
      step('waiting_period', m.rule.ruleName, `Treatment on ${treatmentDate} is before this waiting period ends on ${ends}, so nothing is payable`, before, per, ref)
    }
  }

  // ── 1b. the treatment itself excluded ───────────────────────────────────────
  const treatmentExclusion = treatmentKey
    ? rules.find((m) => m.rule.ruleType === 'EXCLUSION' && m.rule.usability !== 'needs_human_review' && m.rule.appliesTo.includes(treatmentKey))
    : undefined
  if (treatmentExclusion) {
    const before = total()
    const ref = clauseRef(treatmentExclusion)
    const per = work.map((w) => ({ w, amount: deduct(w, 'exclusion', w.payable, `The treatment (${treatmentLabel}) is excluded by "${treatmentExclusion.rule.ruleName}"`, ref) }))
    step('exclusion', treatmentExclusion.rule.ruleName, `The treatment itself (${treatmentLabel}) is excluded, so nothing is payable`, before, per, ref)
  }

  // ── 2. exclusions, conflicts, missing evidence ──────────────────────────────
  {
    const before = total()
    const per: Array<{ w: Work; amount: number }> = []
    for (const w of work) {
      if (w.payable <= 0) {
        per.push({ w, amount: 0 })
        continue
      }
      const text = `${w.item.description} ${w.item.originalText ?? ''}`
      w.matches = matcher.match({ text, category: w.item.category, rules })
      // A clearly stronger match of one kind wins. Anything closer, or a clause the item only partly meets, goes to a reviewer.
      const decision = decideOutcome(w.matches, matcher.conflictMargin)
      const { exclusion, coverage, anyClause } = decision

      if (w.item.confidence === 'low') w.review.push('The amount or wording was read with low confidence. Check it against the bill.')

      if (decision.reviewReason === 'conditional') {
        const one = (exclusion ?? coverage)!
        const ref = clauseRef(rules.find((r) => r.rule.id === one.rule.id && r.versionId === one.versionId)!)
        w.held = w.payable
        w.review.push(`"${one.rule.ruleName}" may apply, but it has a condition this item touches (${one.verification?.condition ?? 'see clause'}). A reviewer must decide.`)
        per.push({ w, amount: deduct(w, 'review_hold', w.payable, 'Held for review: the clause has a condition this item touches', ref) })
      } else if (exclusion && coverage) {
        // Evidence points both ways. Never guess: hold the item and show both clauses.
        const hold = w.payable
        w.held = hold
        const refs = [exclusion, coverage].map((m) => clauseRef(rules.find((r) => r.rule.id === m.rule.id && r.versionId === m.versionId)!))
        w.review.push(`Conflicting evidence: "${exclusion.rule.ruleName}" would exclude this item, but "${coverage.rule.ruleName}" would pay it. A reviewer must decide.`)
        per.push({ w, amount: deduct(w, 'review_hold', hold, 'Held for review: conflicting clauses', refs[0]) })
        for (const r of refs.slice(1)) w.deductions[0].clauses.push(r)
      } else if (exclusion && !exclusion.verification && exclusion.score < 2 && CORE_CATEGORIES.has(w.item.category)) {
        // A keyword match on one shared word ("disposable surgeon gowns" vs "Surgeon fee") is too weak to remove
        // a core medical charge. It is not ignored either: a reviewer decides.
        const ref = clauseRef(rules.find((r) => r.rule.id === exclusion.rule.id && r.versionId === exclusion.versionId)!)
        w.held = w.payable
        w.review.push(`"${exclusion.rule.ruleName}" shares only the word "${exclusion.matchedTerms[0]}" with this charge. A reviewer must decide whether it applies.`)
        per.push({ w, amount: deduct(w, 'review_hold', w.payable, 'Held for review: weak match to an exclusion clause', ref) })
      } else if (exclusion) {
        const ref = clauseRef(rules.find((r) => r.rule.id === exclusion.rule.id && r.versionId === exclusion.versionId)!)
        per.push({ w, amount: deduct(w, 'exclusion', w.payable, `Excluded by "${exclusion.rule.ruleName}" (matched: ${exclusion.matchedTerms.join(', ')})`, ref) })
      } else if (!anyClause && w.item.category === 'other') {
        w.held = w.payable
        w.review.push('No policy clause supports or excludes this charge. A reviewer must decide.')
        per.push({ w, amount: deduct(w, 'review_hold', w.payable, 'Held for review: no clause found for this charge') })
      } else {
        per.push({ w, amount: 0 })
      }
    }
    step('exclusion', 'Exclusions and unclear evidence', 'Items an exclusion clause covers are removed. Conflicting or missing evidence is held, not guessed.', before, per)
  }

  // ── 3. room rent ────────────────────────────────────────────────────────────
  {
    // Policies often state the limit ("1% of Sum Insured per day") and the proportionate deduction in separate
    // clauses: the cap comes from the clause that names an amount, the proration from any clause that declares it.
    const roomRules = rules.filter((m) => m.rule.ruleType === 'ROOM_LIMIT' && m.rule.usability === 'executable' && !m.rule.appliesTo.includes('icu'))
    const roomRule = roomRules.find((m) => (m.rule.effect.amount ?? 0) > 0 || !!m.rule.effect.percentage) ?? roomRules[0]
    const prorationRule = roomRules.find((m) => m.rule.effect.action === 'proration')
    const roomItems = work.filter((w) => w.payable > 0 && isRoomRent(w.item))
    if (roomRule && roomItems.length) {
      const sumInsured = Math.min(...[input.availableSumInsured, rules.find((m) => m.rule.ruleType === 'SUM_INSURED')?.rule.effect.capAmount].filter((v): v is number => !!v && v > 0), Infinity)
      const e = { ...roomRule.rule.effect, action: prorationRule ? 'proration' : roomRule.rule.effect.action }
      const cap = e.amount && e.amount > 0 ? e.amount : e.percentage && Number.isFinite(sumInsured) ? Math.round((sumInsured * e.percentage) / 100) : input.entitledRoomRatePerDay ?? null
      const ref = clauseRef(roomRule)
      const before = total()
      const per: Array<{ w: Work; amount: number }> = []
      if (!cap) {
        for (const w of roomItems) w.review.push(`The policy names a room category but no rupee limit per day. Enter the hospital's rate for that category to compute any room-rent deduction.`)
        warnings.push('Room-rent entitlement has no rupee amount in the policy. Enter the entitled room rate to apply the clause.')
      } else {
        const main = roomItems[0]
        const { days, rate } = roomDaysAndRate(main.item)
        if (rate > cap) {
          const keep = cap * days
          const excess = Math.max(0, main.payable - keep)
          if (e.action === 'proration') {
            const ratio = cap / rate
            per.push({ w: main, amount: deduct(main, 'room_rent', excess, `Room billed at ${inr(rate)}/day, limit ${inr(cap)}/day: ${days} days x ${inr(rate - cap)} excess`, ref) })
            for (const w of work) {
              if (w === main || w.payable <= 0) continue
              if (['room', 'doctor', 'surgery'].includes(w.item.category)) {
                const cut = Math.round(w.payable * (1 - ratio))
                per.push({ w, amount: deduct(w, 'room_rent', cut, `Proportionate deduction: ${inr(cap)} / ${inr(rate)} = ${(ratio * 100).toFixed(1)}% of ${inr(w.payable + cut)} is payable`, ref) })
              }
            }
          } else {
            per.push({ w: main, amount: deduct(main, 'room_rent', excess, `Room billed at ${inr(rate)}/day, limit ${inr(cap)}/day: excess ${inr(rate - cap)} x ${days} days`, ref) })
          }
        }
      }
      step('room_rent', roomRule.rule.ruleName, cap ? `Limit ${inr(cap)} per day${e.action === 'proration' ? ', with proportionate reduction of room-linked charges' : ''}` : 'No rupee limit available', before, per, ref)
    }
  }

  // ── 4. sub-limits ───────────────────────────────────────────────────────────
  for (const m of rules.filter((r) => r.rule.ruleType === 'SUB_LIMIT' && r.rule.usability === 'executable')) {
    const e = m.rule.effect
    const sumInsured = input.availableSumInsured ?? rules.find((r) => r.rule.ruleType === 'SUM_INSURED')?.rule.effect.capAmount ?? null
    const cap = e.capAmount ?? (e.percentage && sumInsured ? Math.round((sumInsured * e.percentage) / 100) : null)
    if (!cap) continue
    // A sub-limit caps the items it names. One that names an implant or device ("joint replacement implants incl.
    // bone cement ₹50,000") caps implant items only, never the surgeon or theatre charges of the same treatment.
    const implantScoped = IMPLANT_WORDS.test(m.text)
    const group = work.filter(
      (w) =>
        w.payable > 0 &&
        (!implantScoped || w.item.category === 'implant') &&
        w.matches.some((x) => x.rule.id === m.rule.id && x.versionId === m.versionId),
    )
    const groupTotal = group.reduce((a, w) => a + w.payable, 0)
    if (!group.length || groupTotal <= cap) continue
    const before = total()
    const ref = clauseRef(m)
    const cuts = allocate(groupTotal - cap, group.map((w) => w.payable))
    const per = group.map((w, i) => ({ w, amount: deduct(w, 'sub_limit', cuts[i], `${m.rule.ruleName}: ${inr(groupTotal)} of related items capped at ${inr(cap)}`, ref) }))
    step('sub_limit', m.rule.ruleName, `${group.length} related item(s) total ${inr(groupTotal)}; cap ${inr(cap)}; ${inr(groupTotal - cap)} removed pro rata`, before, per, ref)
  }

  // ── 5. deductible ───────────────────────────────────────────────────────────
  {
    const m = rules.find((r) => r.rule.ruleType === 'DEDUCTIBLE' && r.rule.effect.amount && r.rule.effect.amount > 0)
    if (m) {
      const before = total()
      const amount = Math.min(m.rule.effect.amount!, before)
      const live = work.filter((w) => w.payable > 0)
      const cuts = allocate(amount, live.map((w) => w.payable))
      const ref = clauseRef(m)
      const per = live.map((w, i) => ({ w, amount: deduct(w, 'deductible', cuts[i], `Share of the ${inr(m.rule.effect.amount!)} deductible`, ref) }))
      step('deductible', m.rule.ruleName, `${inr(m.rule.effect.amount!)} deductible taken once from ${inr(before)}, split pro rata`, before, per, ref)
    }
  }

  // ── 6. co-payment ───────────────────────────────────────────────────────────
  {
    const m = rules.find((r) => r.rule.ruleType === 'COPAY' && r.rule.effect.percentage && r.rule.usability === 'executable')
    if (m) {
      const ageCond = m.rule.conditions.find((c) => c.type === 'age')
      const threshold = ageCond && typeof ageCond.value === 'number' ? ageCond.value : null
      const age = input.patientAge ?? null
      if (threshold !== null && age === null) {
        warnings.push(`"${m.rule.ruleName}" applies from age ${threshold}, but the patient's age was not given, so the co-payment was not applied.`)
      } else if (threshold === null || (age !== null && age >= threshold)) {
        const before = total()
        const pct = m.rule.effect.percentage!
        const amount = Math.round((before * pct) / 100)
        const live = work.filter((w) => w.payable > 0)
        const cuts = allocate(amount, live.map((w) => w.payable))
        const ref = clauseRef(m)
        const per = live.map((w, i) => ({ w, amount: deduct(w, 'copay', cuts[i], `${pct}% co-payment on this item's remaining payable amount`, ref) }))
        step('copay', m.rule.ruleName, `${pct}% of ${inr(before)} remaining after the deductible = ${inr(amount)}${threshold !== null ? ` (patient age ${age} is ${threshold} or more)` : ''}`, before, per, ref)
      }
    }
  }

  // ── 7. sum insured ──────────────────────────────────────────────────────────
  {
    const ruleCap = rules.find((r) => r.rule.ruleType === 'SUM_INSURED')
    const caps = [ruleCap?.rule.effect.capAmount, input.availableSumInsured].filter((v): v is number => !!v && v > 0)
    if (caps.length) {
      const cap = Math.min(...caps)
      const before = total()
      if (before > cap) {
        const live = work.filter((w) => w.payable > 0)
        const cuts = allocate(before - cap, live.map((w) => w.payable))
        const ref = ruleCap ? clauseRef(ruleCap) : undefined
        const per = live.map((w, i) => ({ w, amount: deduct(w, 'sum_insured', cuts[i], `Share of the amount above the ${inr(cap)} sum insured`, ref) }))
        step('sum_insured', ruleCap?.rule.ruleName ?? 'Available sum insured', `Payable ${inr(before)} is above the ${inr(cap)} available, so ${inr(before - cap)} is removed pro rata`, before, per, ref)
      }
    }
  }

  // ── result ──────────────────────────────────────────────────────────────────
  const items: LedgerItem[] = work.map((w) => {
    const claimedItem = Math.max(0, Math.round(w.item.amount))
    const status: ItemStatus = w.held > 0 ? 'review' : w.payable === 0 ? 'excluded' : w.payable < claimedItem ? 'reduced' : 'payable'
    return {
      id: w.item.id,
      description: w.item.description,
      category: w.item.category,
      claimed: claimedItem,
      payable: w.payable,
      deductions: w.deductions,
      status,
      review: w.review,
      heldForReview: w.held,
      matches: w.matches.slice(0, 3).map((m) => ({ ruleName: m.rule.ruleName, versionLabel: m.versionLabel, role: m.role, score: m.score, terms: m.matchedTerms })),
    }
  })

  const byStage: AdjudicationResult['totals']['byStage'] = {}
  for (const it of items) for (const d of it.deductions) byStage[d.stage] = (byStage[d.stage] ?? 0) + d.amount
  const payable = items.reduce((a, i) => a + i.payable, 0)
  const heldForReview = items.reduce((a, i) => a + i.heldForReview, 0)

  trace.push({
    stage: 'result',
    title: 'Payable amount',
    formula: `${inr(claimed)} claimed - ${inr(claimed - payable)} deducted = ${inr(payable)} payable`,
    totalBefore: claimed,
    deducted: claimed - payable,
    totalAfter: payable,
  })

  // Checks: the proof that nothing was applied twice and every rupee is accounted for.
  const messages: string[] = []
  for (const it of items) {
    const ded = it.deductions.reduce((a, d) => a + d.amount, 0)
    if (it.claimed !== it.payable + ded) messages.push(`${it.description}: claimed ${it.claimed} is not payable ${it.payable} plus deductions ${ded}`)
    const stages = it.deductions.map((d) => d.stage)
    if (new Set(stages).size !== stages.length) messages.push(`${it.description}: a stage was applied twice`)
    if (it.payable < 0) messages.push(`${it.description}: negative payable amount`)
  }
  const stageSum = Object.values(byStage).reduce((a, b) => a + (b ?? 0), 0)
  if (claimed - payable !== stageSum) messages.push(`Deductions by stage (${stageSum}) do not equal claimed minus payable (${claimed - payable})`)
  const traceSum = trace.filter((t) => t.stage !== 'start' && t.stage !== 'version' && t.stage !== 'result').reduce((a, t) => a + t.deducted, 0)
  if (traceSum !== claimed - payable) messages.push(`Trace deductions (${traceSum}) do not equal claimed minus payable (${claimed - payable})`)

  return {
    treatmentDate,
    selection,
    items,
    totals: { claimed, payable, patientPays: claimed - payable, heldForReview, byStage },
    trace,
    warnings,
    checks: { ok: messages.length === 0, messages },
    matcher: matcher.name,
  }
}

/** Compares two adjudications of the same bill, item by item. Used for before and after ledgers. */
export function diffAdjudications(before: AdjudicationResult, after: AdjudicationResult) {
  const rows = after.items.map((a) => {
    const b = before.items.find((x) => x.id === a.id)
    return {
      id: a.id,
      description: a.description,
      claimed: a.claimed,
      payableBefore: b?.payable ?? 0,
      payableAfter: a.payable,
      change: a.payable - (b?.payable ?? 0),
      statusBefore: b?.status ?? 'payable',
      statusAfter: a.status,
    }
  })
  return {
    rows,
    payableBefore: before.totals.payable,
    payableAfter: after.totals.payable,
    change: after.totals.payable - before.totals.payable,
    changedItems: rows.filter((r) => r.change !== 0).length,
  }
}
