/**
 * PolicyLens - Preflight Estimator (Blueprint Section 8)
 *
 * Two questions, two techniques:
 *  - What will the hospital charge? A prediction: hospital quote, else the ML cost model (P10/P50/P90),
 *    else the static benchmark (see ./cost).
 *  - How much of that does the policy pay? A calculation: the predicted bill is turned into line items and run
 *    through the same claim engine as the Claim Ledger (lib/claims/adjudicate), once for the low, typical and
 *    high bill. There is no second copy of the policy arithmetic here, so the two features cannot disagree on
 *    the same bill.
 *
 * This module adds what only a pre-admission estimate needs: the timeline of waiting periods, the questions
 * that would change the answer, the room the policy allows, and the claim-readiness checklist.
 */

import { buildCostBreakdown } from './breakdown'
import { PolicyAnalysisResult, CompiledRule } from '../types/policy'
import {
  TreatmentScenario,
  MlCostPrediction,
  PolicyEvaluation,
  CoverageResult,
  DeductionLine,
  MissingField,
  TimelineMilestone,
  ClaimReadinessItem,
  QuoteLineItem,
} from '../types/estimate'
import type { HospitalBillLineItem } from '../types/bill'
import { compilePolicyRules } from '../policy/compiler'
import {
  parseCurrency,
  calculateDateDiffMonths,
  calculateDateDiffDays,
  formatINR,
  normalizeRoomCategory,
  ROOM_TIER_RANK,
  findCanonicalProcedureKey,
  getCanonicalProcedureKey,
} from '../policy/normalizers'
import { estimateCostDetailed, type DetailedCostResult } from './cost'
import { getRoomMultiplier } from './dataset'
import { matchTreatmentWithCandidates } from './matching'
import {
  adjudicate,
  isRoomRent,
  roomDaysAndRate,
  waitingApplies,
  waitingCompletionDate,
  waitingContext,
  type AdjudicationInput,
} from '../claims/adjudicate'
import { makeVersion, selectVersion } from '../claims/versions'
import type { AdjudicationResult, DeductionStage } from '../claims/types'

export interface PreflightEvaluationOptions {
  customCompiledRules?: CompiledRule[]
  /** Dynamic cost distribution from the ML microservice; omit to use the static benchmark. */
  mlPrediction?: MlCostPrediction | null
}

// ─── Predicted bill → bill line items ─────────────────────────────────────────

/**
 * The cost model's lines as bill items. Room lines from a model or benchmark are labelled as room rent, the way
 * a hospital bills them, so the room clause recognises them ("Room & Nursing" would be read as nursing care).
 * A hospital's own quote keeps its wording.
 */
function toBillItems(cost: DetailedCostResult, scenario: TreatmentScenario): HospitalBillLineItem[] {
  const fromQuote = cost.costSource === 'hospital_quote'
  return cost.lineItems.map((li: QuoteLineItem) => {
    const roomLine = !fromQuote && (li.category === 'room' || li.category === 'icu')
    const days = cost.stayDurationDays
    return {
      id: li.id,
      description: roomLine ? `Room rent (${scenario.roomType}) - ${days} day${days === 1 ? '' : 's'}` : li.description,
      category: li.category,
      quantity: roomLine ? days : li.quantity,
      unitPrice: roomLine ? Math.round(li.amount / days) : li.unitPrice,
      amount: li.amount,
      confidence: li.confidence,
    }
  })
}

/** Rescales items to a new total in whole rupees; the parts add up exactly (largest remainder). */
function scaleItems(items: HospitalBillLineItem[], total: number): HospitalBillLineItem[] {
  const sum = items.reduce((a, i) => a + i.amount, 0)
  if (sum <= 0 || total === sum) return items
  const raw = items.map((i) => (i.amount * total) / sum)
  const out = raw.map(Math.floor)
  let rem = Math.round(total) - out.reduce((a, b) => a + b, 0)
  const order = raw.map((r, i) => ({ i, f: r - out[i] })).sort((a, b) => b.f - a.f || a.i - b.i)
  for (let k = 0; rem > 0 && k < order.length; k++, rem--) out[order[k].i]++
  return items.map((i, k) => ({
    ...i,
    amount: out[k],
    unitPrice: i.quantity > 1 ? Math.round(out[k] / i.quantity) : out[k],
  }))
}

// ─── Claim-engine result → Clause-to-Rupee ledger lines ───────────────────────

const STAGE_ORDER: DeductionStage[] = ['waiting_period', 'exclusion', 'review_hold', 'room_rent', 'sub_limit', 'deductible', 'copay', 'sum_insured']

const STAGE_META: Record<DeductionStage, { ruleType: string; category: string; impact: DeductionLine['impact']; title: string }> = {
  waiting_period: { ruleType: 'WAITING_PERIOD', category: 'Waiting Period', impact: 'denial', title: 'Waiting period' },
  exclusion: { ruleType: 'EXCLUSION', category: 'Exclusion', impact: 'deduction', title: 'Exclusion' },
  review_hold: { ruleType: 'REVIEW_HOLD', category: 'Held for review', impact: 'deduction', title: 'Held for review' },
  room_rent: { ruleType: 'ROOM_LIMIT', category: 'Room Limit', impact: 'deduction', title: 'Room rent' },
  sub_limit: { ruleType: 'SUB_LIMIT', category: 'Sub-limit', impact: 'cap', title: 'Sub-limit' },
  deductible: { ruleType: 'DEDUCTIBLE', category: 'Deductible', impact: 'deduction', title: 'Deductible' },
  copay: { ruleType: 'COPAY', category: 'Co-payment', impact: 'deduction', title: 'Co-payment' },
  sum_insured: { ruleType: 'SUM_INSURED', category: 'Sum Insured', impact: 'cap', title: 'Sum insured' },
}

/** One line per stage and clause, in the order the engine applied them, with the running covered amount. */
function toDeductionLines(result: AdjudicationResult): DeductionLine[] {
  type Group = { stage: DeductionStage; amount: number; clause?: AdjudicationResult['items'][number]['deductions'][number]['clauses'][number]; parts: string[] }
  const groups = new Map<string, Group>()
  for (const it of result.items) {
    for (const d of it.deductions) {
      const clause = d.clauses[0]
      const key = `${d.stage}:${clause?.ruleId ?? ''}`
      const g = groups.get(key) ?? { stage: d.stage, amount: 0, clause, parts: [] }
      g.amount += d.amount
      g.parts.push(`${it.description} ${formatINR(d.amount)}`)
      groups.set(key, g)
    }
  }

  let running = result.totals.claimed
  return [...groups.values()]
    .filter((g) => g.amount > 0)
    .sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage))
    .map((g) => {
      const meta = STAGE_META[g.stage]
      const before = running
      running -= g.amount
      const step = result.trace.find((t) => t.stage === g.stage && (t.clause?.ruleId ?? '') === (g.clause?.ruleId ?? ''))
      const items = g.parts.length > 3 ? [...g.parts.slice(0, 3), `${g.parts.length - 3} more`] : g.parts
      const wholeClaim = g.amount === result.totals.claimed
      return {
        id: `ded_${g.stage}_${g.clause?.ruleId ?? 'none'}`,
        ruleId: g.clause?.ruleId,
        ruleName: g.clause?.ruleName ?? meta.title,
        category: meta.category,
        ruleType: meta.ruleType,
        originalAmount: before,
        deductionAmount: g.amount,
        coveredAmountAfter: running,
        evidence: g.clause
          ? { page: g.clause.page, section: g.clause.section, quote: g.clause.quote }
          : { page: null, quote: g.stage === 'review_hold' ? 'No policy clause clearly supports or excludes these charges.' : meta.title },
        calculation: step?.formula ?? `${meta.title}: ${items.join(', ')}`,
        impact: g.stage === 'exclusion' && wholeClaim ? 'denial' : meta.impact,
      }
    })
}

// ─── Evaluation ───────────────────────────────────────────────────────────────

export function evaluatePolicyPreflight(
  scenario: TreatmentScenario,
  policy: PolicyAnalysisResult,
  options?: PreflightEvaluationOptions
): CoverageResult {
  // 1. Executable rules and the treatment's identity
  const compiledRules = options?.customCompiledRules ||
    policy.compiled_rules ||
    compilePolicyRules(policy.rules, policy.pages)
  const treatmentKey = findCanonicalProcedureKey(scenario.treatment) ?? getCanonicalProcedureKey(scenario.treatment)

  // 2. The predicted bill (prediction, not policy arithmetic)
  const matchedCandidate = matchTreatmentWithCandidates(scenario)
  const costDetails = estimateCostDetailed(scenario, matchedCandidate.bestMatch, options?.mlPrediction)

  const missingInformation: MissingField[] = []
  const assumptions: string[] = []
  if (costDetails.costSource === 'ml_model') {
    assumptions.push('Treatment cost is a model estimate (P10-P90 range, median shown as typical) built from procedure, city, hospital tier, room class, age and stay length; it is not a hospital quote.')
  }
  const milestones: TimelineMilestone[] = []
  const readinessChecklist: ClaimReadinessItem[] = []

  // Sum insured
  let totalSumInsured: number | null = null
  if (typeof policy.overview.sum_insured_amount === 'number') {
    totalSumInsured = policy.overview.sum_insured_amount
  } else if (policy.overview.sum_insured) {
    totalSumInsured = parseCurrency(policy.overview.sum_insured)
  }
  const effectiveSumInsured = scenario.availableSumInsured ?? totalSumInsured

  if (scenario.availableSumInsured === undefined && totalSumInsured !== null) {
    missingInformation.push({
      id: 'mf_remaining_si',
      field: 'availableSumInsured',
      label: 'Remaining Sum Insured for Current Year',
      whyItMatters: 'If you had previous claims this policy year, your remaining cover might be lower than the base sum insured.',
      impact: 'changes_room_deduction',
      suggestedInputType: 'number',
      defaultValue: totalSumInsured,
    })
  }

  const hasStartDate = !!scenario.policyStartDate
  const admissionDateStr = scenario.proposedAdmissionDate || new Date().toISOString().split('T')[0]

  if (!hasStartDate) {
    missingInformation.push({
      id: 'mf_start_date',
      field: 'policyStartDate',
      label: 'Policy Inception / Continuity Date',
      whyItMatters: 'Required to compute waiting periods (30-day initial, 24-month specific illnesses, and pre-existing disease completion).',
      impact: 'blocks_estimate',
      suggestedInputType: 'date',
    })
    assumptions.push('Policy inception date is unknown; assuming initial and specific waiting periods might still be active.')
  }

  if (scenario.declaredPED === undefined) {
    missingInformation.push({
      id: 'mf_ped',
      field: 'declaredPED',
      label: 'Declared Pre-existing Diseases (PED)',
      whyItMatters: 'If this procedure is linked to a pre-existing medical condition, an extended 24-48 month waiting period applies.',
      impact: 'changes_waiting_period',
      suggestedInputType: 'select',
      options: ['None', 'Diabetes', 'Hypertension', 'Cardiac / Heart condition', 'Joint / Arthritis', 'Thyroid'],
    })
  }

  // 3. The policy as the claim engine sees it. Only the base document: amendments are applied in the Claim Ledger.
  const version = makeVersion({
    id: 'base',
    label: 'Your policy',
    documentName: policy.overview.plan_name || 'Policy document',
    result: { ...policy, compiled_rules: compiledRules },
    kind: 'base',
    effectiveFrom: null,
  })

  const baseItems = toBillItems(costDetails, scenario)
  const engineInput = (items: HospitalBillLineItem[]): AdjudicationInput => ({
    items,
    bill: { diagnosis: scenario.treatment, admissionDate: admissionDateStr },
    versions: [version],
    treatmentDate: admissionDateStr,
    patientAge: Number.isFinite(scenario.age) ? scenario.age : null,
    policyStartDate: scenario.policyStartDate || null,
    availableSumInsured: effectiveSumInsured,
    entitledRoomRatePerDay: entitledRoomRate(items),
    treatmentKey,
    declaredPED: scenario.declaredPED ?? null,
  })

  // 4. Room the policy allows. When the clause names a category but no rupee limit, the engine needs the daily
  //    rate of that category: the user's figure, the billed rate when the chosen room is within the entitlement,
  //    or an estimate scaled from the billed rate by the room-tier price ratio.
  const roomRule = compiledRules.find((r) => r.ruleType === 'ROOM_LIMIT' && r.usability === 'executable')
  const siRuleCap = compiledRules.find((r) => r.ruleType === 'SUM_INSURED')?.effect.capAmount
  const roomCapInRupees = !!roomRule && (
    (roomRule.effect.amount ?? 0) > 0 ||
    (!!roomRule.effect.percentage && !!(effectiveSumInsured || siRuleCap))
  )
  const selectedRoom = normalizeRoomCategory(scenario.roomType)
  const eligibleRoom = normalizeRoomCategory(
    (roomRule?.conditions.find((c) => c.type === 'room_category')?.value as string) || 'single-private',
  )
  const userRoomRate = Number(scenario.entitledRoomRatePerDay)
  const aboveEntitlement = ROOM_TIER_RANK[selectedRoom] > ROOM_TIER_RANK[eligibleRoom]
  let estimatedRoomRate: number | null = null

  function entitledRoomRate(items: HospitalBillLineItem[]): number | null {
    if (!roomRule || roomCapInRupees) return null
    if (userRoomRate > 0) return userRoomRate
    const room = items.find(isRoomRent)
    if (!room) return null
    const { rate } = roomDaysAndRate(room)
    if (!aboveEntitlement) return rate
    return Math.round((rate * getRoomMultiplier(eligibleRoom)) / getRoomMultiplier(selectedRoom))
  }

  if (roomRule && !roomCapInRupees && aboveEntitlement && !(userRoomRate > 0)) {
    estimatedRoomRate = entitledRoomRate(baseItems)
    if (estimatedRoomRate) {
      assumptions.push(
        `Your policy allows a ${eligibleRoom} room but names no rupee limit. The room-rent deduction assumes that room costs about ${formatINR(estimatedRoomRate)} a day at this hospital; enter the hospital's actual rate to make it exact.`,
      )
      missingInformation.push({
        id: 'mf_room_rate',
        field: 'entitledRoomRatePerDay',
        label: `Daily rate of a ${eligibleRoom} room at this hospital`,
        whyItMatters: `You chose a ${selectedRoom} room, above the ${eligibleRoom} room your policy allows. What you pay depends on the difference between the two daily rates.`,
        relatedRuleId: roomRule.id,
        relatedClauseQuote: roomRule.evidence.quote,
        pageNumber: roomRule.evidence.page,
        impact: 'changes_room_deduction',
        suggestedInputType: 'number',
        defaultValue: estimatedRoomRate,
      })
    }
  }

  // 5. Run the claim engine on the low, typical and high bill
  const typicalInput = engineInput(scaleItems(baseItems, costDetails.avg))
  const typical = adjudicate(typicalInput)
  const low = adjudicate(engineInput(scaleItems(baseItems, costDetails.min)))
  const high = adjudicate(engineInput(scaleItems(baseItems, costDetails.max)))
  for (const w of typical.warnings) if (!assumptions.includes(w)) assumptions.push(w)

  // 6. Waiting-period timeline, using the engine's own applicability test and calendar
  const ctx = waitingContext(typicalInput)
  const merged = selectVersion([version], admissionDateStr).rules
  for (const m of merged) {
    const wRule = m.rule
    const p = wRule.effectivePeriod
    if (wRule.ruleType !== 'WAITING_PERIOD' || !p) continue
    const isInitial = p.type === 'initial'
    const isPED = p.type === 'ped' || wRule.appliesTo.includes('ped')
    const completionDate = hasStartDate ? waitingCompletionDate(scenario.policyStartDate!, p) ?? '' : ''
    const isCompleted = !!completionDate && admissionDateStr >= completionDate

    milestones.push({
      id: `ms_${wRule.id}`,
      title: isInitial
        ? 'Initial 30-Day Waiting Period'
        : isPED
          ? 'Pre-existing Disease (PED) Waiting Period'
          : `Specific Illness Waiting Period (${wRule.ruleName})`,
      durationText: p.months ? `${p.months} Months` : `${p.days} Days`,
      targetDate: completionDate || 'Unknown',
      isCompleted,
      isRelevantToTreatment: waitingApplies(m, ctx),
      ruleEvidence: { page: wRule.evidence.page, quote: wRule.evidence.quote, ruleName: wRule.ruleName },
      status: !hasStartDate ? 'pending_start_date' : isCompleted ? 'met' : 'active_wait',
      daysRemaining: !hasStartDate || !completionDate ? undefined : Math.max(0, calculateDateDiffDays(admissionDateStr, completionDate)),
    })
  }

  const waitingStep = typical.trace.find((t) => t.stage === 'waiting_period' && t.deducted > 0)
  const waitingPeriodMet = !typical.totals.byStage.waiting_period
  let waitingPeriodDetails: CoverageResult['waitingPeriodDetails'] = undefined
  if (!waitingPeriodMet && waitingStep?.clause) {
    const fired = compiledRules.find((r) => r.id === waitingStep.clause!.ruleId)
    const p = fired?.effectivePeriod
    waitingPeriodDetails = {
      requiredMonths: p?.months ?? Math.round((p?.days ?? 0) / 30),
      elapsedMonths: calculateDateDiffMonths(scenario.policyStartDate!, admissionDateStr),
      completionDate: p ? waitingCompletionDate(scenario.policyStartDate!, p) ?? undefined : undefined,
      ruleEvidence: waitingStep.clause.quote,
      pageNumber: waitingStep.clause.page,
      isActive: true,
    }
  }

  // ─── Claim readiness checklist (Blueprint Section 11) ─────────────────────
  const claimRules = compiledRules.filter(r => r.ruleType === 'CLAIM_REQUIREMENT')

  readinessChecklist.push({
    id: 'cr_1',
    title: 'Hospital Intimation & Pre-Authorization Form',
    category: 'claim_form',
    status: scenario.isNetworkHospital ? 'available' : 'recommended',
    description: 'Submit cashless pre-auth request at hospital insurance desk at least 48 hours prior to planned admission.',
  })

  readinessChecklist.push({
    id: 'cr_2',
    title: 'Treating Doctor Consultation & Prescription',
    category: 'clinical_document',
    status: 'available',
    description: 'Doctor clinical notes indicating necessity for inpatient admission and procedure advice.',
  })

  readinessChecklist.push({
    id: 'cr_3',
    title: 'Diagnostic Test & Investigation Reports',
    category: 'clinical_document',
    status: 'recommended',
    description: 'Diagnostic evidence supporting clinical diagnosis (e.g., MRI/X-ray for knee, ultrasound for appendicitis).',
  })

  for (const cRule of claimRules) {
    readinessChecklist.push({
      id: `cr_policy_${cRule.id}`,
      title: cRule.ruleName,
      category: 'policy_fact',
      status: 'recommended',
      evidenceText: cRule.evidence.quote,
      pageNumber: cRule.evidence.page,
      description: cRule.evidence.quote || cRule.ruleName,
    })
  }

  // Evidence coverage (% of impactful rules with verified evidence)
  const impactfulRules = compiledRules.filter(r => r.usability === 'executable')
  const verifiedCount = impactfulRules.filter(r => r.verification === 'verified').length
  const evidenceCoverage = impactfulRules.length > 0
    ? Math.round((verifiedCount / impactfulRules.length) * 100)
    : 100

  // 7. Money: the engine's payable amounts at the three bill sizes
  const runs = [low, typical, high]
  const payable = runs.map((r) => r.totals.payable)
  const youPay = runs.map((r) => r.totals.patientPays)

  const fullyDenied =
    typical.totals.claimed > 0 &&
    typical.totals.payable === 0 &&
    (!!typical.totals.byStage.waiting_period || typical.totals.byStage.exclusion === typical.totals.claimed)

  const finalStatus: CoverageResult['status'] =
    !hasStartDate ? 'cannot_determine' :
    fullyDenied ? 'not_eligible' :
    typical.totals.payable === 0 ? 'cannot_determine' :
    typical.totals.patientPays > 0 ? 'conditional' :
    'eligible'

  const costConfidence: 'high' | 'medium' | 'low' =
    costDetails.costSource === 'hospital_quote' ? 'high' :
    costDetails.costSource === 'manual_quote' ? 'high' :
    costDetails.costSource === 'ml_model'
      ? (costDetails.costModel?.uncertaintyLevel === 'high' ? 'low' : 'medium')
    : costDetails.costSource === 'benchmark' ? 'medium' : 'low'

  const coverageConfidence: 'high' | 'medium' | 'low' =
    evidenceCoverage >= 75 && missingInformation.length === 0 && typical.totals.heldForReview === 0 ? 'high' :
    missingInformation.length > 0 ? 'low' : 'medium'

  const overallConfidence: 'high' | 'medium' | 'low' =
    costConfidence === 'high' && coverageConfidence === 'high' ? 'high' :
    costConfidence === 'low' || coverageConfidence === 'low' ? 'low' : 'medium'

  return {
    status: finalStatus,
    treatmentCost: {
      min: costDetails.min,
      typical: costDetails.avg,
      max: costDetails.max,
    },
    potentiallyCovered: {
      min: Math.min(...payable),
      typical: typical.totals.payable,
      max: Math.max(...payable),
    },
    patientShare: {
      min: Math.min(...youPay),
      typical: typical.totals.patientPays,
      max: Math.max(...youPay),
    },
    costSource: costDetails.costSource,
    costModel: costDetails.costModel,
    ledger: toDeductionLines(typical),
    missingInformation,
    assumptions,
    evidenceCoverage,
    confidence: overallConfidence,
    costConfidence,
    coverageConfidence,
    waitingPeriodMet,
    waitingPeriodDetails,
    lineItems: costDetails.lineItems,
    costBreakdown: buildCostBreakdown({
      components: costDetails.components,
      total: costDetails.avg,
      stayDays: costDetails.stayDurationDays,
      scenario,
      source: costDetails.costSource,
    }),
    readinessChecklist,
    milestones,
    heldForReview: typical.totals.heldForReview,
    itemLedger: typical.items,
  }
}

// ─── Legacy Wrapper for existing components ─────────────────────────────────

export function evaluatePolicyRules(
  scenario: TreatmentScenario,
  policy: PolicyAnalysisResult
): PolicyEvaluation {
  const preflight = evaluatePolicyPreflight(scenario, policy)

  let applicableSubLimit: number | null = null
  let applicableRoomLimit: number | null = null
  let deductible = 0
  let coPayPercentage = 0
  const reasons: string[] = []

  for (const d of preflight.ledger) {
    if (d.ruleType === 'DEDUCTIBLE') deductible = d.deductionAmount
    if (d.ruleType === 'COPAY') {
      const match = d.calculation.match(/(\d+)%/)
      if (match) coPayPercentage = parseInt(match[1], 10)
    }
    if (d.ruleType === 'SUB_LIMIT') applicableSubLimit = d.coveredAmountAfter
    if (d.ruleType === 'ROOM_LIMIT') applicableRoomLimit = d.deductionAmount
    reasons.push(`${d.ruleName}: ${d.calculation}`)
  }

  return {
    isCovered: preflight.status !== 'not_eligible',
    isWaitPeriodActive: !preflight.waitingPeriodMet,
    applicableSubLimit,
    applicableRoomLimit,
    deductible,
    coPayPercentage,
    sumInsured: preflight.potentiallyCovered.max,
    reasons,
  }
}
