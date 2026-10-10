/**
 * Hospitalization preparation checklist generator.
 *
 * Deterministic and grounded: every policy task is built from an extracted
 * PolicyRule (its name, value, quoted evidence, page and section). No policy
 * terms, deadlines or obligations are invented — obligation wording is only
 * used when the cited clause itself uses it, deadlines/due dates only when the
 * clause states a period, and anything low-confidence is flagged for
 * verification. General good practice is labelled `recommendation`.
 *
 * Coverage maths is NOT repeated here: scenario-specific signals (active waiting
 * period, exclusion denial, room/co-pay deductions) are read from the existing
 * Preflight Estimator result.
 */

import type { CompiledRule, ExtractionReport, PolicyOverview, PolicyRule } from '@/lib/types/policy'
import type {
  ChecklistPreflightSignals,
  ChecklistPriority,
  ChecklistScenario,
  ChecklistStage,
  ChecklistTaskDefinition,
  ClauseReference,
  RequirementLevel,
} from '@/lib/types/checklist'
import {
  addDaysToDate,
  CANONICAL_PROCEDURES,
  getCanonicalProcedureKey,
  normalizeRoomCategory,
  parseCurrency,
  parsePercentage,
  ROOM_TIER_RANK,
} from '@/lib/policy/normalizers'

export const CHECKLIST_GENERATOR_VERSION = 1

export interface ChecklistGenerationInput {
  rules: PolicyRule[]
  compiledRules?: CompiledRule[]
  overview?: Partial<PolicyOverview>
  scenario?: ChecklistScenario | null
  preflight?: ChecklistPreflightSignals | null
  extractionReport?: Pick<ExtractionReport, 'pages_needing_rescan' | 'pages_with_ambiguous_amounts'> | null
}

// ─── Text helpers ────────────────────────────────────────────────────────────

const OBLIGATION = /\b(must|shall|mandatory|compulsor(y|ily)|required|is to be|are to be|need to|needs to|necessary)\b/i

function ruleText(r: PolicyRule): string {
  return [r.rule_name, r.value, r.description, ...(r.conditions || []), r.evidence_text].join(' ').toLowerCase()
}

function slug(s: string, max = 48): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, max) || 'item'
  )
}

function refOf(r: PolicyRule): ClauseReference {
  return {
    ruleId: r.id,
    page: r.page_number,
    section: r.section_name || undefined,
    quote: r.evidence_text || r.description || r.rule_name,
    verified: !!r.evidence_validated,
  }
}

function dedupeRefs(refs: ClauseReference[]): ClauseReference[] {
  const seen = new Set<string>()
  return refs.filter((r) => {
    const k = `${r.page}|${r.quote.slice(0, 80)}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

function levelFor(rules: PolicyRule[]): RequirementLevel {
  if (rules.length === 0) return 'recommendation'
  return rules.some((r) => OBLIGATION.test(r.evidence_text || '')) ? 'policy_requirement' : 'policy_term'
}

/** Rules whose evidence is weak enough that the user should confirm the term */
function verificationFor(rules: PolicyRule[]): { needsVerification: boolean; verificationNote?: string } {
  const weak = rules.filter(
    (r) =>
      r.confidence === 'low' ||
      !r.evidence_validated ||
      r.status === 'unclear' ||
      r.usability === 'needs_human_review',
  )
  if (weak.length === 0) return { needsVerification: false }
  const pages = Array.from(new Set(weak.map((r) => r.page_number).filter((p): p is number => p !== null)))
  return {
    needsVerification: true,
    verificationNote:
      `The supporting clause${weak.length > 1 ? 's were' : ' was'} extracted with low confidence or could not be matched to the policy text` +
      (pages.length ? ` (page ${pages.join(', ')})` : '') +
      '. Confirm the exact wording with your insurer/TPA before relying on it.',
  }
}

function citeShort(r: PolicyRule): string {
  const where = [r.section_name, r.page_number ? `page ${r.page_number}` : ''].filter(Boolean).join(', ')
  return where ? ` (${where})` : ''
}

// ─── Deadlines (only when a clause states a period) ─────────────────────────

export interface ParsedDeadline {
  amount: number
  unit: 'hours' | 'days'
  relation: 'before' | 'after'
  anchor: 'admission' | 'discharge' | 'unspecified'
  phrase: string
}

/** All time periods stated in a clause, e.g. "48 hours before admission", "within 30 days of discharge" */
export function extractDeadlines(text: string): ParsedDeadline[] {
  const re =
    /((?:within|at least|not later than|no later than|minimum of|maximum of)\s+)?(\d{1,3})\s*(hours?|hrs?|days?)\b((?:\s+(?:of|from|after|before|prior to|in advance of|preceding|following))?(?:\s+(?:the\s+)?(?:date\s+of\s+)?(?:planned\s+)?(admission|discharge|hospitali[sz]ation|surgery))?)/gi
  const out: ParsedDeadline[] = []
  for (const m of text.matchAll(re)) {
    const amount = parseInt(m[2], 10)
    if (!amount) continue
    const unit = /^h/i.test(m[3]) ? 'hours' : 'days'
    const tail = (m[4] || '').toLowerCase()
    const before = /before|prior|advance|preceding/.test(tail) || /at least/i.test(m[1] || '')
    const anchorWord = (m[5] || '').toLowerCase()
    const anchor = anchorWord.startsWith('discharge') ? 'discharge' : anchorWord ? 'admission' : 'unspecified'
    out.push({ amount, unit, relation: before ? 'before' : 'after', anchor, phrase: m[0].trim() })
  }
  return out
}

export function extractDeadline(text: string): ParsedDeadline | null {
  return extractDeadlines(text)[0] ?? null
}

const deadlinesOf = (rules: PolicyRule[]) =>
  rules.flatMap((r) => extractDeadlines([r.evidence_text, r.value, r.description].filter(Boolean).join(' ')))

/** Planned admission: a period *before* admission */
const pickPlannedDeadline = (rules: PolicyRule[]) =>
  deadlinesOf(rules).find((d) => d.relation === 'before') ?? null
/** Emergency admission: a short period *after* admission (hours, or ≤ 7 days) */
const pickEmergencyDeadline = (rules: PolicyRule[]) =>
  deadlinesOf(rules).find((d) => d.relation === 'after' && d.anchor !== 'discharge' && (d.unit === 'hours' || d.amount <= 7)) ?? null
/** Claim submission: a period after discharge, or a multi-day limit */
const pickSubmissionDeadline = (rules: PolicyRule[]) => {
  const all = deadlinesOf(rules).filter((d) => d.relation === 'after')
  return all.find((d) => d.anchor === 'discharge') ?? all.find((d) => d.unit === 'days' && d.amount >= 7) ?? null
}

function shiftDate(date: string, deadline: ParsedDeadline): string {
  const days = deadline.unit === 'hours' ? Math.ceil(deadline.amount / 24) : deadline.amount
  return addDaysToDate(date, deadline.relation === 'before' ? -days : days)
}

// ─── Treatment matching ─────────────────────────────────────────────────────

function treatmentTerms(treatment: string): { key: string; terms: string[] } {
  const key = getCanonicalProcedureKey(treatment)
  const proc = CANONICAL_PROCEDURES.find((p) => p.key === key)
  const terms = new Set<string>([treatment.toLowerCase().trim()])
  if (proc) {
    terms.add(proc.label.toLowerCase())
    terms.add(proc.key.replace(/_/g, ' '))
    proc.aliases.forEach((a) => terms.add(a.toLowerCase()))
  }
  return { key, terms: Array.from(terms).filter((t) => t.length >= 4) }
}

function ruleMatchesTreatment(
  r: PolicyRule,
  match: { key: string; terms: string[] } | null,
  compiledById: Map<string, CompiledRule>,
): boolean {
  if (!match) return false
  const compiled = compiledById.get(r.id)
  if (compiled?.appliesTo.includes(match.key)) return true
  const text = ruleText(r)
  return match.terms.some((t) => text.includes(t))
}

// ─── Document detection ─────────────────────────────────────────────────────

export const CLAIM_DOCUMENTS: Array<{ key: string; label: string; re: RegExp; stage: ChecklistStage }> = [
  { key: 'preauth_approval', label: 'Pre-authorization / cashless approval letter', re: /(pre-?auth\w*|cashless)\s+(approval|letter|authori[sz]ation letter)/, stage: 'before' },
  { key: 'claim_form', label: 'Completed claim form', re: /claim forms?/, stage: 'claim' },
  { key: 'discharge_summary', label: 'Discharge summary', re: /discharge (summary|card|certificate)/, stage: 'claim' },
  { key: 'final_bill', label: 'Final itemised hospital bill', re: /(final|original|itemi[sz]ed|detailed|main|hospital) (hospital )?bills?|hospital (invoice|bill)/, stage: 'claim' },
  { key: 'payment_receipts', label: 'Payment receipts', re: /(payment |money |original )?receipts?/, stage: 'claim' },
  { key: 'pharmacy_bills', label: 'Pharmacy / medicine bills', re: /pharmacy|chemist|medicine bills?/, stage: 'claim' },
  { key: 'prescriptions', label: "Doctor's prescriptions", re: /prescriptions?/, stage: 'claim' },
  { key: 'investigation_reports', label: 'Investigation & diagnostic reports', re: /(investigation|diagnostic|laboratory|lab|pathology|radiology|test|x-?ray|scan) reports?/, stage: 'claim' },
  { key: 'doctor_certificate', label: "Treating doctor's certificate", re: /(doctor|physician|surgeon|practitioner)'?s?\s+(certificate|letter|note)|medical certificate/, stage: 'claim' },
  { key: 'id_proof', label: 'Photo ID / KYC documents', re: /\bkyc\b|photo id|identity proof|id proof|aadhaa?r|pan card/, stage: 'claim' },
  { key: 'bank_details', label: 'Cancelled cheque / bank details', re: /cancell?ed cheque|bank (details|account)|\bneft\b/, stage: 'claim' },
  { key: 'fir_mlc', label: 'FIR / medico-legal certificate (accident cases)', re: /\bfir\b|first information report|medico[- ]legal|\bmlc\b/, stage: 'claim' },
  { key: 'implant_invoice', label: 'Implant invoice / sticker', re: /implant (invoice|sticker|bill)|\bstickers?\b/, stage: 'claim' },
]

/** Universally useful for health claims, used only when the policy names no document of that type */
const GENERAL_DOCUMENTS = ['discharge_summary', 'final_bill', 'investigation_reports']

// ─── Generator ───────────────────────────────────────────────────────────────

const PREAUTH = /pre-?auth\w*|cashless|prior (approval|intimation)|intimat\w*|notif(y|ied|ication)|inform (the )?(company|insurer|tpa)/
const CLAIM_SUBMISSION = /(submit\w*|submission|lodg\w*|file|filing|send)\b.{0,80}\b\d{1,3}\s*days?|\d{1,3}\s*days?.{0,60}(submit\w*|submission|lodg\w*)/
const NON_PAYABLE = /consumables?|non-?medical|non-?payable|toiletr|attendant|admission kit|registration charges?/
const NETWORK = /network hospital|cashless|non-?network|preferred provider|\bppn\b/
const ENHANCEMENT = /enhancement|additional (authori[sz]ation|approval)|revised estimate/

export function generateChecklist(input: ChecklistGenerationInput): ChecklistTaskDefinition[] {
  const rules = input.rules || []
  const scenario = input.scenario?.treatment?.trim() ? input.scenario : null
  const preflight = input.preflight || null
  const compiledById = new Map((input.compiledRules || []).map((c) => [c.id, c]))
  const match = scenario ? treatmentTerms(scenario.treatment) : null
  const treatmentLabel = scenario?.treatment?.trim()
  const tasks: ChecklistTaskDefinition[] = []
  const add = (t: ChecklistTaskDefinition) => {
    if (!tasks.some((x) => x.key === t.key)) tasks.push(t)
  }

  const byCat = (...cats: PolicyRule['category'][]) => rules.filter((r) => cats.includes(r.category))
  const admission = scenario?.proposedAdmissionDate
  const discharge =
    admission && scenario?.stayDurationDays ? addDaysToDate(admission, scenario.stayDurationDays) : undefined

  // ── 1. Pre-authorization / intimation (Before / During) ─────────────────
  const intimationRules = rules.filter(
    (r) => (r.category === 'claim_requirement' || r.category === 'general' || r.category === 'eligibility') && PREAUTH.test(ruleText(r)),
  )
  // A clause can cover both planned and emergency admissions
  const plannedRules = intimationRules.filter(
    (r) => !/emergenc/.test(ruleText(r)) || /planned|prior|before|advance|cashless|pre-?auth/.test(ruleText(r)),
  )
  const emergencyRules = intimationRules.filter((r) => /emergenc/.test(ruleText(r)))

  if (plannedRules.length > 0) {
    const deadline = pickPlannedDeadline(plannedRules)
    const level = levelFor(plannedRules)
    const suggestedDueDate =
      deadline && admission && deadline.relation === 'before' ? shiftDate(admission, deadline) : undefined
    add({
      key: 'preauth:planned',
      stage: 'before',
      title: deadline ? `Request pre-authorization / notify insurer (${deadline.phrase})` : 'Request pre-authorization / notify your insurer before admission',
      explanation: `Your policy describes an intimation / pre-authorization step for planned hospitalisation: “${plannedRules[0].rule_name}${plannedRules[0].value ? ` — ${plannedRules[0].value}` : ''}”${citeShort(plannedRules[0])}.`,
      whyItMatters:
        level === 'policy_requirement'
          ? 'The policy wording makes this a requirement; missing it can lead to a cashless request being declined or a reimbursement claim being questioned.'
          : 'Following the policy’s intimation process avoids delays and makes cashless treatment possible where available.',
      recommendedAction: scenario?.isNetworkHospital
        ? 'Ask the hospital’s insurance/TPA desk to send the pre-authorization request, and keep the reference number.'
        : 'Contact your insurer/TPA through the channel listed in the policy, share the treating doctor’s advice, and record the reference number.',
      priority: 'high',
      requirementLevel: level,
      references: dedupeRefs(plannedRules.map(refOf)),
      ...verificationFor(plannedRules),
      suggestedDueDate,
      dueDateBasis: suggestedDueDate && deadline ? `Policy states “${deadline.phrase}”; planned admission ${admission}.` : undefined,
      alertType: 'pre_authorization',
      scenarioSpecific: !!suggestedDueDate,
    })
  }

  if (emergencyRules.length > 0) {
    const deadline = pickEmergencyDeadline(emergencyRules)
    add({
      key: 'preauth:emergency',
      stage: 'during',
      title: deadline ? `For emergency admission, notify the insurer (${deadline.phrase})` : 'For emergency admission, notify the insurer as the policy describes',
      explanation: `The policy sets a separate intimation rule for emergencies: “${emergencyRules[0].rule_name}${emergencyRules[0].value ? ` — ${emergencyRules[0].value}` : ''}”${citeShort(emergencyRules[0])}.`,
      whyItMatters: 'Late intimation of an emergency admission is a common reason for claim queries.',
      recommendedAction: 'Ask a family member or the hospital insurance desk to inform the insurer/TPA as soon as the patient is admitted, and note the intimation number.',
      priority: 'high',
      requirementLevel: levelFor(emergencyRules),
      references: dedupeRefs(emergencyRules.map(refOf)),
      ...verificationFor(emergencyRules),
      alertType: 'pre_authorization',
    })
  }

  // ── 2. Network / cashless ───────────────────────────────────────────────
  const networkRules = rules.filter((r) => NETWORK.test(ruleText(r)))
  if (networkRules.length > 0) {
    add({
      key: 'network:confirm-hospital',
      stage: 'before',
      title: 'Confirm whether your hospital is in the insurer’s network',
      explanation:
        scenario?.isNetworkHospital === true
          ? 'You indicated a network hospital in your scenario. The policy treats network and non-network hospitals differently, so confirm the hospital is on the current list.'
          : 'The policy distinguishes network (cashless) and non-network (reimbursement) hospitals.',
      whyItMatters: 'Whether cashless treatment is available — and which claim process applies — depends on the hospital’s network status.',
      recommendedAction: 'Check the insurer’s current network hospital list or call the TPA helpline, quoting the hospital name and city.',
      priority: 'medium',
      requirementLevel: 'policy_term',
      references: dedupeRefs(networkRules.slice(0, 3).map(refOf)),
      ...verificationFor(networkRules.slice(0, 3)),
      scenarioSpecific: scenario?.isNetworkHospital !== undefined,
    })
  }

  // ── 3. Waiting periods ─────────────────────────────────────────────────
  const waiting = byCat('waiting_period')
  const hasPED = (scenario?.declaredPED?.length ?? 0) > 0
  const wpMatched = waiting.filter(
    (r) => ruleMatchesTreatment(r, match, compiledById) || (hasPED && /pre-?existing|\bped\b/.test(ruleText(r))),
  )
  const wpActive = preflight?.waitingPeriodDetails?.isActive

  for (const r of wpMatched) {
    const isPED = /pre-?existing|\bped\b/.test(ruleText(r)) && !ruleMatchesTreatment(r, match, compiledById)
    add({
      key: `wait:${slug(r.rule_name)}:p${r.page_number ?? 'na'}`,
      stage: 'before',
      title: isPED
        ? `Check the pre-existing disease waiting period (${r.value})`
        : `Check the ${r.value} waiting period for ${treatmentLabel}`,
      explanation: `${r.description || r.rule_name}${citeShort(r)}.` +
        (wpActive && preflight?.waitingPeriodDetails?.completionDate
          ? ` Your Preflight Estimator result shows this waiting period is still running until ${preflight.waitingPeriodDetails.completionDate}.`
          : ''),
      whyItMatters: 'Claims for treatment within an applicable waiting period are generally not payable, so this can decide whether the hospitalisation is covered at all.',
      recommendedAction: wpActive
        ? 'Discuss with your doctor whether a planned procedure can wait until the waiting period ends, and confirm the dates with your insurer.'
        : 'Confirm your continuous-coverage start date (including any portability credit) with the insurer and compare it with the waiting period.',
      priority: wpActive === false ? 'medium' : 'high',
      requirementLevel: 'policy_term',
      references: [refOf(r)],
      ...verificationFor([r]),
      alertType: 'waiting_period',
      scenarioSpecific: true,
    })
  }

  const initialWait = waiting.find((r) => /initial|first \d+ days|30 days/.test(ruleText(r)) && !wpMatched.includes(r))
  if (initialWait) {
    add({
      key: `wait:initial:p${initialWait.page_number ?? 'na'}`,
      stage: 'before',
      title: `Check that the initial waiting period (${initialWait.value}) has passed`,
      explanation: `${initialWait.description || initialWait.rule_name}${citeShort(initialWait)}.`,
      whyItMatters: 'Non-accident hospitalisation during the initial waiting period is usually not covered.',
      recommendedAction: scenario?.policyStartDate && admission
        ? `Compare your policy start date (${scenario.policyStartDate}) with the planned admission (${admission}) against the clause.`
        : 'Check your policy start date on the policy schedule and compare it with the planned admission date.',
      priority: 'medium',
      requirementLevel: 'policy_term',
      references: [refOf(initialWait)],
      ...verificationFor([initialWait]),
      alertType: 'waiting_period',
    })
  }

  const otherWaits = waiting.filter((r) => !wpMatched.includes(r) && r !== initialWait)
  if (otherWaits.length > 0) {
    add({
      key: 'wait:review-others',
      stage: 'before',
      title: scenario ? `Confirm ${treatmentLabel} is not covered by another waiting period` : 'Check whether your treatment falls under a waiting period',
      explanation: `The policy lists ${otherWaits.length} other waiting period${otherWaits.length > 1 ? 's' : ''}: ${otherWaits
        .slice(0, 5)
        .map((r) => `${r.rule_name} (${r.value})`)
        .join('; ')}.`,
      whyItMatters: 'If the diagnosis falls under one of these, the claim may not be payable until the waiting period ends.',
      recommendedAction: 'Ask your doctor for the exact diagnosis and compare it with the listed conditions; confirm with the insurer if unsure.',
      priority: scenario ? 'low' : 'medium',
      requirementLevel: 'policy_term',
      references: dedupeRefs(otherWaits.slice(0, 5).map(refOf)),
      ...verificationFor(otherWaits.slice(0, 5)),
      alertType: scenario ? undefined : 'waiting_period',
    })
  }

  // ── 4. Exclusions ──────────────────────────────────────────────────────
  const exclusions = byCat('exclusion')
  const deniedByPreflight = (preflight?.ledger || []).filter((l) => l.impact === 'denial' && /EXCLUSION/i.test(l.ruleType))
  const exMatched = exclusions.filter(
    (r) => ruleMatchesTreatment(r, match, compiledById) || deniedByPreflight.some((l) => l.ruleId === r.id),
  )
  for (const r of exMatched) {
    add({
      key: `excl:${slug(r.rule_name)}:p${r.page_number ?? 'na'}`,
      stage: 'before',
      title: `Check exclusion: ${r.rule_name}`,
      explanation: `The policy excludes or restricts: ${r.description || r.value}${citeShort(r)}. This appears related to ${treatmentLabel}.`,
      whyItMatters: 'If the exclusion applies to your diagnosis, the insurer may decline the claim, leaving the full cost with you.',
      recommendedAction: 'Ask your doctor to document the medical reason for the treatment and get written confirmation from the insurer/TPA before admission.',
      priority: 'high',
      requirementLevel: 'policy_term',
      references: [refOf(r)],
      ...verificationFor([r]),
      alertType: 'exclusion_or_limit',
      scenarioSpecific: true,
    })
  }

  const nonPayable = rules.filter((r) => NON_PAYABLE.test(ruleText(r)))
  if (nonPayable.length > 0) {
    add({
      key: 'during:non-payable-items',
      stage: 'during',
      title: 'Keep track of items the policy does not pay for',
      explanation: `The policy limits or excludes items such as: ${nonPayable
        .slice(0, 4)
        .map((r) => r.rule_name)
        .join('; ')}.`,
      whyItMatters: 'Non-payable items (often consumables and non-medical charges) are deducted from the claim and paid by you.',
      recommendedAction: 'Ask the hospital which charges are non-payable under your policy and review the interim bill for them.',
      priority: 'medium',
      requirementLevel: 'policy_term',
      references: dedupeRefs(nonPayable.slice(0, 4).map(refOf)),
      ...verificationFor(nonPayable.slice(0, 4)),
      alertType: 'exclusion_or_limit',
    })
  }

  const otherExclusions = exclusions.filter((r) => !exMatched.includes(r) && !nonPayable.includes(r))
  if (otherExclusions.length > 0) {
    add({
      key: 'excl:review-others',
      stage: 'before',
      title: 'Review the policy exclusions against your diagnosis',
      explanation: `${otherExclusions.length} exclusion${otherExclusions.length > 1 ? 's were' : ' was'} extracted, e.g. ${otherExclusions
        .slice(0, 4)
        .map((r) => r.rule_name)
        .join('; ')}.`,
      whyItMatters: 'An exclusion that matches the diagnosis can result in the whole claim being declined.',
      recommendedAction: 'Compare the diagnosis on your doctor’s advice with the Exclusions tab and clarify anything unclear with the insurer.',
      priority: 'low',
      requirementLevel: 'policy_term',
      references: dedupeRefs(otherExclusions.slice(0, 4).map(refOf)),
      ...verificationFor(otherExclusions.slice(0, 4)),
    })
  }

  // ── 5. Room rent / ICU ─────────────────────────────────────────────────
  const roomRules = byCat('room_rent')
  if (roomRules.length > 0) {
    const r = roomRules[0]
    const roomDeduction = (preflight?.ledger || []).some((l) => /ROOM/i.test(l.ruleType) && l.deductionAmount > 0)
    const chosenAbove =
      scenario?.roomType &&
      ROOM_TIER_RANK[normalizeRoomCategory(scenario.roomType)] > ROOM_TIER_RANK[normalizeRoomCategory(r.value)]
    const proportionate = roomRules.some((x) => /proportion/.test(ruleText(x)))
    add({
      key: 'room:eligible-category',
      stage: 'before',
      title: `Choose a room within your eligible room rent (${r.value})`,
      explanation: `${r.description || r.rule_name}${citeShort(r)}.` +
        (roomDeduction ? ' Your Preflight Estimator result shows a room-rent deduction for the room you selected.' : ''),
      whyItMatters: proportionate
        ? 'The policy mentions proportionate deduction: choosing a costlier room can reduce the amount paid on other charges too, not just the room.'
        : 'Room charges above the policy limit are not paid by the insurer.',
      recommendedAction: 'Ask the hospital for the tariff of each room category and choose one at or below the limit, or budget for the difference.',
      priority: roomDeduction || chosenAbove ? 'high' : 'medium',
      requirementLevel: 'policy_term',
      references: dedupeRefs(roomRules.map(refOf)),
      ...verificationFor(roomRules),
      alertType: 'room_rent',
      scenarioSpecific: !!(roomDeduction || chosenAbove),
    })
  }
  const icuRules = byCat('icu_limit')
  if (icuRules.length > 0) {
    add({
      key: 'during:icu-limit',
      stage: 'during',
      title: `Note the ICU limit (${icuRules[0].value}) if ICU care is needed`,
      explanation: `${icuRules[0].description || icuRules[0].rule_name}${citeShort(icuRules[0])}.`,
      whyItMatters: 'ICU charges above the policy limit are paid by you.',
      recommendedAction: 'If an ICU stay is advised, ask the hospital for the ICU daily tariff and compare it with the limit.',
      priority: 'low',
      requirementLevel: 'policy_term',
      references: dedupeRefs(icuRules.map(refOf)),
      ...verificationFor(icuRules),
      alertType: 'room_rent',
    })
  }

  // ── 6. Co-payment / deductible / sub-limits / sum insured ──────────────
  // A zero / nil co-payment or deductible needs no action
  const isNil = (r: PolicyRule) =>
    /\b(zero|nil|none|not applicable|no (co-?pay\w*|deductible))\b/i.test(`${r.value} ${r.rule_name}`) ||
    parseCurrency(r.value) === 0 ||
    parsePercentage(r.value) === 0

  for (const r of byCat('co_payment').filter((x) => !isNil(x))) {
    const copayHit = (preflight?.ledger || []).some((l) => /COPAY/i.test(l.ruleType) && l.deductionAmount > 0)
    add({
      key: `cost:copay:${slug(r.rule_name)}`,
      stage: 'before',
      title: `Budget for the co-payment (${r.value})`,
      explanation: `${r.description || r.rule_name}${r.conditions?.length ? ` Conditions: ${r.conditions.join('; ')}.` : ''}${citeShort(r)}.`,
      whyItMatters: 'A co-payment is the share of each admissible claim you pay yourself.',
      recommendedAction: 'Check whether the co-payment conditions apply to you and keep funds aside for your share.',
      priority: copayHit ? 'high' : 'medium',
      requirementLevel: 'policy_term',
      references: [refOf(r)],
      ...verificationFor([r]),
      alertType: copayHit ? 'exclusion_or_limit' : undefined,
      scenarioSpecific: copayHit,
    })
  }

  for (const r of byCat('deductible').filter((x) => !isNil(x))) {
    add({
      key: `cost:deductible:${slug(r.rule_name)}`,
      stage: 'before',
      title: `Plan for the deductible (${r.value})`,
      explanation: `${r.description || r.rule_name}${citeShort(r)}.`,
      whyItMatters: 'The insurer pays only the part of the claim above the deductible.',
      recommendedAction: 'Keep funds available for the deductible amount.',
      priority: 'medium',
      requirementLevel: 'policy_term',
      references: [refOf(r)],
      ...verificationFor([r]),
    })
  }

  const subLimits = byCat('sub_limit')
  const subMatched = subLimits.filter((r) => ruleMatchesTreatment(r, match, compiledById))
  for (const r of subMatched) {
    add({
      key: `limit:${slug(r.rule_name)}:p${r.page_number ?? 'na'}`,
      stage: 'before',
      title: `Check the sub-limit for ${treatmentLabel} (${r.value})`,
      explanation: `${r.description || r.rule_name}${citeShort(r)}.`,
      whyItMatters: 'Costs above a procedure sub-limit are not reimbursed, even if your sum insured is higher.',
      recommendedAction: 'Ask the hospital for a written estimate and compare it with the sub-limit (the Preflight Estimator shows the impact).',
      priority: 'high',
      requirementLevel: 'policy_term',
      references: [refOf(r)],
      ...verificationFor([r]),
      alertType: 'exclusion_or_limit',
      scenarioSpecific: true,
    })
  }
  const otherSubLimits = subLimits.filter((r) => !subMatched.includes(r))
  if (otherSubLimits.length > 0) {
    add({
      key: 'limit:review-others',
      stage: 'before',
      title: 'Review procedure-specific sub-limits',
      explanation: `The policy caps some treatments: ${otherSubLimits
        .slice(0, 5)
        .map((r) => `${r.rule_name} (${r.value})`)
        .join('; ')}.`,
      whyItMatters: 'If your treatment has a sub-limit, the insurer will not pay above it.',
      recommendedAction: 'Check whether your procedure appears in this list.',
      priority: 'low',
      requirementLevel: 'policy_term',
      references: dedupeRefs(otherSubLimits.slice(0, 5).map(refOf)),
      ...verificationFor(otherSubLimits.slice(0, 5)),
    })
  }

  const siRule = byCat('sum_insured')[0]
  if (siRule || input.overview?.sum_insured) {
    add({
      key: 'cost:remaining-sum-insured',
      stage: 'before',
      title: 'Check your remaining sum insured',
      explanation: `Your policy sum insured is ${siRule?.value || input.overview?.sum_insured}. Earlier claims in the same policy year reduce what is available.`,
      whyItMatters: 'The insurer will not pay beyond the remaining sum insured for the year.',
      recommendedAction: 'Ask your insurer/TPA for your remaining balance, including any bonus or restore benefit.',
      priority: 'low',
      requirementLevel: siRule ? 'policy_term' : 'recommendation',
      references: siRule ? [refOf(siRule)] : [],
      ...(siRule ? verificationFor([siRule]) : { needsVerification: false }),
    })
  }

  // ── 7. During treatment ─────────────────────────────────────────────────
  const enhancementRules = rules.filter((r) => ENHANCEMENT.test(ruleText(r)))
  if (enhancementRules.length > 0) {
    add({
      key: 'during:enhancement',
      stage: 'during',
      title: 'Request an enhancement if the treatment or cost changes',
      explanation: `${enhancementRules[0].description || enhancementRules[0].rule_name}${citeShort(enhancementRules[0])}.`,
      whyItMatters: 'Costs beyond the approved cashless amount may not be settled at discharge without additional approval.',
      recommendedAction: 'Ask the hospital insurance desk to send an enhancement request with the revised estimate.',
      priority: 'medium',
      requirementLevel: levelFor(enhancementRules),
      references: dedupeRefs(enhancementRules.slice(0, 2).map(refOf)),
      ...verificationFor(enhancementRules.slice(0, 2)),
      alertType: 'claim_requirement',
    })
  }
  add({
    key: 'during:keep-records',
    stage: 'during',
    title: 'Keep originals of every bill, prescription and report',
    explanation: 'Collect and file documents as treatment progresses rather than at discharge.',
    whyItMatters: 'Missing originals are a frequent cause of claim queries and delays.',
    recommendedAction: 'Keep a folder for all papers and attach copies to the matching tasks below.',
    priority: 'low',
    requirementLevel: 'recommendation',
    references: [],
    needsVerification: false,
  })

  // ── 8. Claim submission: deadline + documents ───────────────────────────
  const claimRules = rules.filter((r) => r.category === 'claim_requirement' || r.category === 'general')
  const submissionRules = claimRules.filter((r) => CLAIM_SUBMISSION.test(ruleText(r)))
  if (submissionRules.length > 0) {
    const r = submissionRules[0]
    const deadline = pickSubmissionDeadline(submissionRules)
    const anchorDate = deadline?.anchor === 'admission' ? admission : discharge
    const suggestedDueDate = deadline && anchorDate && deadline.relation === 'after' ? shiftDate(anchorDate, deadline) : undefined
    add({
      key: 'claim:submission-deadline',
      stage: 'claim',
      title: deadline ? `Submit the reimbursement claim (${deadline.phrase})` : 'Submit the reimbursement claim within the policy time limit',
      explanation: `${r.description || r.rule_name}${citeShort(r)}. Usually relevant when you claim reimbursement rather than settling cashless.`,
      whyItMatters: 'Claims filed after the policy time limit can be delayed or rejected unless the delay is justified.',
      recommendedAction: 'Send the claim form with all listed documents to the insurer/TPA and keep proof of submission.',
      priority: 'high',
      requirementLevel: levelFor([r]),
      references: dedupeRefs(submissionRules.map(refOf)),
      ...verificationFor(submissionRules),
      suggestedDueDate,
      dueDateBasis:
        suggestedDueDate && deadline
          ? `Policy states “${deadline.phrase}”; estimated ${deadline.anchor === 'admission' ? 'admission' : 'discharge'} ${anchorDate}${deadline.anchor !== 'admission' && scenario?.stayDurationDays ? ` (${scenario.stayDurationDays}-day stay)` : ''}.`
          : undefined,
      alertType: 'claim_requirement',
      scenarioSpecific: !!suggestedDueDate,
    })
  }

  const docRules = rules.filter((r) => ['claim_requirement', 'general', 'eligibility'].includes(r.category))
  const mentionedDocs = new Set<string>()
  for (const doc of CLAIM_DOCUMENTS) {
    const sources = docRules.filter((r) => doc.re.test(ruleText(r)))
    if (sources.length === 0) continue
    mentionedDocs.add(doc.key)
    add({
      key: `doc:${doc.key}`,
      stage: doc.stage,
      title: doc.key === 'preauth_approval' ? `Keep the ${doc.label.toLowerCase()}` : `Collect: ${doc.label}`,
      explanation: `Listed in your policy’s claim conditions${citeShort(sources[0])}.`,
      whyItMatters: 'Documents named in the policy are typically needed to process the claim; missing ones lead to queries and delays.',
      recommendedAction: `Get the ${doc.label.toLowerCase()} from the hospital or doctor and attach a copy here.`,
      priority: levelFor(sources) === 'policy_requirement' ? 'high' : 'medium',
      requirementLevel: levelFor(sources),
      references: dedupeRefs(sources.slice(0, 3).map(refOf)),
      ...verificationFor(sources.slice(0, 3)),
      documentType: doc.key,
      alertType: 'missing_documents',
    })
  }
  for (const key of GENERAL_DOCUMENTS) {
    if (mentionedDocs.has(key)) continue
    const doc = CLAIM_DOCUMENTS.find((d) => d.key === key)!
    add({
      key: `doc:${doc.key}`,
      stage: 'claim',
      title: `Collect: ${doc.label}`,
      explanation: 'Not specifically named in the extracted policy text, but routinely requested for health insurance claims.',
      whyItMatters: 'Having it ready avoids back-and-forth with the insurer.',
      recommendedAction: `Ask the hospital for the ${doc.label.toLowerCase()} before you leave and attach a copy here.`,
      priority: 'low',
      requirementLevel: 'recommendation',
      references: [],
      needsVerification: false,
      documentType: doc.key,
    })
  }

  // Remaining claim requirements not already represented above
  const used = new Set(tasks.flatMap((t) => t.references.map((r) => r.ruleId)).filter(Boolean) as string[])
  for (const r of byCat('claim_requirement')) {
    if (used.has(r.id)) continue
    add({
      key: `claim:${slug(r.rule_name)}:p${r.page_number ?? 'na'}`,
      stage: PREAUTH.test(ruleText(r)) ? 'before' : 'claim',
      title: r.rule_name,
      explanation: `${r.description || r.value}${citeShort(r)}.`,
      whyItMatters: 'This is one of the claim conditions extracted from your policy.',
      recommendedAction: 'Read the cited clause and complete or confirm this step with the insurer/TPA.',
      priority: levelFor([r]) === 'policy_requirement' ? 'medium' : 'low',
      requirementLevel: levelFor([r]),
      references: [refOf(r)],
      ...verificationFor([r]),
      alertType: levelFor([r]) === 'policy_requirement' ? 'claim_requirement' : undefined,
    })
  }

  // ── 9. Unreadable / ambiguous scanned pages ─────────────────────────────
  const rescan = input.extractionReport?.pages_needing_rescan ?? []
  const ambiguous = input.extractionReport?.pages_with_ambiguous_amounts ?? []
  if (rescan.length > 0 || ambiguous.length > 0) {
    const pages = Array.from(new Set([...rescan, ...ambiguous])).sort((a, b) => a - b)
    add({
      key: 'verify:unclear-pages',
      stage: 'before',
      title: `Verify policy terms on page${pages.length > 1 ? 's' : ''} ${pages.join(', ')}`,
      explanation:
        'Parts of these pages could not be read reliably from the uploaded scan, so some terms or amounts may be missing from this checklist.',
      whyItMatters: 'Requirements on unreadable pages cannot be checked automatically.',
      recommendedAction: 'Read these pages in your original policy document, or upload a clearer scan (300 DPI or higher) to re-run the analysis.',
      priority: 'high',
      requirementLevel: 'recommendation',
      references: pages.map((p) => ({ page: p, quote: 'Unclear scan', verified: false })),
      needsVerification: true,
      verificationNote: 'OCR could not read these pages reliably.',
      alertType: 'verification',
    })
  }

  return tasks
}
