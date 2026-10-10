/**
 * PolicyLens - Policy Rule Evaluation Engine (Blueprint Section 8)
 * Compiles policy rules into executable form, runs deterministic eligibility,
 * waiting periods (date math), exclusions, room caps, deductibles, co-pays,
 * and sums insured, emitting an auditable Clause-to-Rupee ledger.
 */

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
} from '../types/estimate'
import { compilePolicyRules } from '../policy/compiler'
import {
  parseCurrency,
  parsePercentage,
  calculateDateDiffMonths,
  calculateDateDiffDays,
  addMonthsToDate,
  addDaysToDate,
  formatDateIndian,
  formatINR,
  normalizeRoomCategory,
  ROOM_TIER_RANK,
  getCanonicalProcedureKey,
} from '../policy/normalizers'
import { estimateCostDetailed } from './cost'
import { matchTreatmentWithCandidates } from './matching'

export interface PreflightEvaluationOptions {
  customCompiledRules?: CompiledRule[]
  /** Dynamic cost distribution from the ML microservice; omit to use the static benchmark. */
  mlPrediction?: MlCostPrediction | null
}

export function evaluatePolicyPreflight(
  scenario: TreatmentScenario,
  policy: PolicyAnalysisResult,
  options?: PreflightEvaluationOptions
): CoverageResult {
  // 1. Get or compile executable rules
  const compiledRules = options?.customCompiledRules ||
    policy.compiled_rules ||
    compilePolicyRules(policy.rules, policy.pages)

  // 2. Resolve treatment canonical identity
  const canonicalTreatment = getCanonicalProcedureKey(scenario.treatment)
  const matchedCandidate = matchTreatmentWithCandidates(scenario)
  const costDetails = estimateCostDetailed(scenario, matchedCandidate.bestMatch, options?.mlPrediction)

  const ledger: DeductionLine[] = []
  const missingInformation: MissingField[] = []
  const assumptions: string[] = []
  if (costDetails.costSource === 'ml_model') {
    assumptions.push('Treatment cost is a model estimate (P10-P90 range, median shown as typical) built from procedure, city, hospital tier, room class, age and stay length; it is not a hospital quote.')
  }
  const milestones: TimelineMilestone[] = []
  const readinessChecklist: ClaimReadinessItem[] = []

  let status: CoverageResult['status'] = 'eligible'
  let waitingPeriodMet = true
  let waitingPeriodDetails: CoverageResult['waitingPeriodDetails'] = undefined

  // Sum Insured resolution
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

  // ─── 1. ELIGIBILITY GATES & DATE ARITHMETIC ────────────────────────────────

  // Check Policy Start / Continuity Date
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
    status = 'cannot_determine'
    assumptions.push('Policy inception date is unknown; assuming initial and specific waiting periods might still be active.')
  }

  // Evaluate Waiting Period Rules
  const waitingRules = compiledRules.filter(r => r.ruleType === 'WAITING_PERIOD')
  
  for (const wRule of waitingRules) {
    const isPEDRule = wRule.effectivePeriod?.type === 'ped' || wRule.appliesTo.includes('ped')
    const isInitialRule = wRule.effectivePeriod?.type === 'initial' || (wRule.effectivePeriod?.days === 30)
    const reqMonths = wRule.effectivePeriod?.months || (wRule.effectivePeriod?.days ? Math.round(wRule.effectivePeriod.days / 30) : 24)

    let completionDate = ''
    let isCompleted = false
    let daysRemaining = 0

    if (scenario.policyStartDate) {
      if (wRule.effectivePeriod?.days && wRule.effectivePeriod.days <= 90) {
        completionDate = addDaysToDate(scenario.policyStartDate, wRule.effectivePeriod.days)
      } else {
        completionDate = addMonthsToDate(scenario.policyStartDate, reqMonths)
      }
      const daysDiff = calculateDateDiffDays(admissionDateStr, completionDate)
      isCompleted = daysDiff <= 0
      daysRemaining = Math.max(0, daysDiff)
    }

    const milestoneTitle = isInitialRule
      ? 'Initial 30-Day Waiting Period'
      : isPEDRule
      ? 'Pre-existing Disease (PED) Waiting Period'
      : `Specific Illness Waiting Period (${wRule.ruleName})`

    // Check if this waiting period applies to current treatment
    const isApplicableToTreatment = Boolean(
      isInitialRule ||
      wRule.appliesTo.includes(canonicalTreatment) ||
      wRule.appliesTo.includes('all') ||
      (isPEDRule && scenario.declaredPED && scenario.declaredPED.length > 0)
    )

    milestones.push({
      id: `ms_${wRule.id}`,
      title: milestoneTitle,
      durationText: wRule.effectivePeriod?.days && wRule.effectivePeriod.days <= 90
        ? `${wRule.effectivePeriod.days} Days`
        : `${reqMonths} Months`,
      targetDate: completionDate || 'Unknown',
      isCompleted,
      isRelevantToTreatment: isApplicableToTreatment,
      ruleEvidence: {
        page: wRule.evidence.page,
        quote: wRule.evidence.quote,
        ruleName: wRule.ruleName,
      },
      status: !hasStartDate ? 'pending_start_date' : isCompleted ? 'met' : 'active_wait',
      daysRemaining: !hasStartDate ? undefined : daysRemaining,
    })

    if (isApplicableToTreatment && hasStartDate && !isCompleted) {
      waitingPeriodMet = false
      status = 'not_eligible'
      waitingPeriodDetails = {
        requiredMonths: reqMonths,
        elapsedMonths: calculateDateDiffMonths(scenario.policyStartDate!, admissionDateStr),
        completionDate,
        ruleEvidence: wRule.evidence.quote,
        pageNumber: wRule.evidence.page,
        isActive: true,
      }
    }
  }

  // Pre-existing Condition Declarations Check
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

  // ─── 2. EXCLUSION GATES ─────────────────────────────────────────────────────

  let isExcluded = false
  const exclusionRules = compiledRules.filter(r => r.ruleType === 'EXCLUSION')

  for (const exRule of exclusionRules) {
    const applies = exRule.appliesTo.includes(canonicalTreatment) ||
      exRule.ruleName.toLowerCase().includes(scenario.treatment.toLowerCase())

    if (applies) {
      isExcluded = true
      status = 'not_eligible'
      ledger.push({
        id: `ded_ex_${exRule.id}`,
        ruleId: exRule.id,
        ruleName: exRule.ruleName,
        category: 'Exclusion',
        ruleType: 'EXCLUSION',
        originalAmount: costDetails.avg,
        deductionAmount: costDetails.avg,
        coveredAmountAfter: 0,
        evidence: exRule.evidence,
        calculation: `Complete denial: procedure '${scenario.treatment}' matches exclusion clause '${exRule.ruleName}'`,
        impact: 'denial',
      })
      break
    }
  }

  // ─── 3. DETERMINISTIC COVERAGE & DEDUCTION RUN ──────────────────────────────

  const initialAmount = costDetails.avg
  let runningCovered = isExcluded || !waitingPeriodMet ? 0 : initialAmount
  let runningMin = isExcluded || !waitingPeriodMet ? 0 : costDetails.min
  let runningMax = isExcluded || !waitingPeriodMet ? 0 : costDetails.max

  if (isExcluded) {
    // Already in ledger
  } else if (!waitingPeriodMet && waitingPeriodDetails) {
    ledger.push({
      id: 'ded_waiting_period',
      ruleName: 'Waiting Period Active',
      category: 'Waiting Period',
      ruleType: 'WAITING_PERIOD',
      originalAmount: initialAmount,
      deductionAmount: initialAmount,
      coveredAmountAfter: 0,
      evidence: {
        page: waitingPeriodDetails.pageNumber ?? null,
        quote: waitingPeriodDetails.ruleEvidence || 'Waiting period active for proposed admission date.',
      },
      calculation: `Claim inadmissible: Admission date (${formatDateIndian(admissionDateStr)}) is before waiting period completion (${formatDateIndian(waitingPeriodDetails.completionDate)})`,
      impact: 'denial',
    })
  } else {
    // ─── 3A. ROOM RENT CAP & PRORATION ────────────────────────────────────────
    const roomRules = compiledRules.filter(r => r.ruleType === 'ROOM_LIMIT')
    const selectedRoom = normalizeRoomCategory(scenario.roomType)

    for (const rRule of roomRules) {
      const eligibleRoomStr = rRule.conditions.find(c => c.type === 'room_category')?.value as string || 'single-private'
      const eligibleRoom = normalizeRoomCategory(eligibleRoomStr)
      const selectedRank = ROOM_TIER_RANK[selectedRoom]
      const eligibleRank = ROOM_TIER_RANK[eligibleRoom]

      // Check daily room cap in rupees
      let dailyRoomCap: number | null = null
      if (rRule.effect.amount) {
        dailyRoomCap = rRule.effect.amount
      } else if (rRule.effect.percentage && totalSumInsured) {
        // e.g. 1% of Sum Insured per day
        dailyRoomCap = Math.round((totalSumInsured * rRule.effect.percentage) / 100)
      }

      const stayDays = costDetails.stayDurationDays
      const totalRoomBilled = costDetails.components.room
      const dailyRoomBilled = Math.round(totalRoomBilled / stayDays)

      let roomDeduction = 0
      let explanation = ''

      if (dailyRoomCap && dailyRoomBilled > dailyRoomCap) {
        if (rRule.effect.action === 'proration') {
          // Proportionate deduction applies to room and associated medical expenses
          const prorationRatio = dailyRoomCap / dailyRoomBilled
          const associatedCharges = costDetails.components.doctor + costDetails.components.surgery
          const associatedDeduction = Math.round(associatedCharges * (1 - prorationRatio))
          const roomExcess = (dailyRoomBilled - dailyRoomCap) * stayDays
          roomDeduction = roomExcess + associatedDeduction

          explanation = `Proportionate deduction: Room cap ₹${dailyRoomCap.toLocaleString('en-IN')}/day vs billed ₹${dailyRoomBilled.toLocaleString('en-IN')}/day (${Math.round(prorationRatio * 100)}% admissible ratio). Excess room ₹${roomExcess.toLocaleString('en-IN')} + proportionate surgery/doctor deduction ₹${associatedDeduction.toLocaleString('en-IN')}.`
        } else {
          // Direct room excess deduction
          roomDeduction = (dailyRoomBilled - dailyRoomCap) * stayDays
          explanation = `Room cap of ₹${dailyRoomCap.toLocaleString('en-IN')}/day exceeded by ₹${(dailyRoomBilled - dailyRoomCap).toLocaleString('en-IN')}/day x ${stayDays} days.`
        }
      } else if (selectedRank > eligibleRank) {
        // Room tier exceeded
        const estimatedExcess = Math.round(totalRoomBilled * 0.40)
        roomDeduction = estimatedExcess
        explanation = `Selected room (${scenario.roomType}) exceeds policy eligible tier (${eligibleRoom}). Excess room fee deducted.`
      }

      if (roomDeduction > 0) {
        const actualDed = Math.min(runningCovered, roomDeduction)
        runningCovered -= actualDed
        runningMin = Math.max(0, runningMin - actualDed)
        runningMax = Math.max(0, runningMax - actualDed)

        ledger.push({
          id: `ded_room_${rRule.id}`,
          ruleId: rRule.id,
          ruleName: rRule.ruleName,
          category: 'Room Limit',
          ruleType: 'ROOM_LIMIT',
          originalAmount: runningCovered + actualDed,
          deductionAmount: actualDed,
          coveredAmountAfter: runningCovered,
          evidence: rRule.evidence,
          calculation: explanation,
          impact: 'deduction',
        })
      }
    }

    // ─── 3B. SPECIFIC SUB-LIMITS ──────────────────────────────────────────────
    const subLimitRules = compiledRules.filter(r => r.ruleType === 'SUB_LIMIT')

    for (const sRule of subLimitRules) {
      const applies = sRule.appliesTo.includes(canonicalTreatment) ||
        sRule.ruleName.toLowerCase().includes(scenario.treatment.toLowerCase())

      if (applies) {
        const capAmount = sRule.effect.capAmount ||
          (sRule.effect.percentage && totalSumInsured ? Math.round((totalSumInsured * sRule.effect.percentage) / 100) : null)

        if (capAmount && runningCovered > capAmount) {
          const deduction = runningCovered - capAmount
          runningCovered = capAmount
          runningMax = Math.min(runningMax, capAmount)
          runningMin = Math.min(runningMin, capAmount)

          ledger.push({
            id: `ded_sublimit_${sRule.id}`,
            ruleId: sRule.id,
            ruleName: sRule.ruleName,
            category: 'Sub-limit',
            ruleType: 'SUB_LIMIT',
            originalAmount: runningCovered + deduction,
            deductionAmount: deduction,
            coveredAmountAfter: runningCovered,
            evidence: sRule.evidence,
            calculation: `Sub-limit cap of ₹${capAmount.toLocaleString('en-IN')} enforced for '${scenario.treatment}'.`,
            impact: 'cap',
          })
        }
      }
    }

    // ─── 3C. POLICY DEDUCTIBLE ────────────────────────────────────────────────
    const deductibleRules = compiledRules.filter(r => r.ruleType === 'DEDUCTIBLE')

    for (const dRule of deductibleRules) {
      const dedAmount = dRule.effect.amount
      if (dedAmount && dedAmount > 0 && runningCovered > 0) {
        const actualDed = Math.min(runningCovered, dedAmount)
        runningCovered -= actualDed
        runningMin = Math.max(0, runningMin - actualDed)
        runningMax = Math.max(0, runningMax - actualDed)

        ledger.push({
          id: `ded_deductible_${dRule.id}`,
          ruleId: dRule.id,
          ruleName: dRule.ruleName,
          category: 'Deductible',
          ruleType: 'DEDUCTIBLE',
          originalAmount: runningCovered + actualDed,
          deductionAmount: actualDed,
          coveredAmountAfter: runningCovered,
          evidence: dRule.evidence,
          calculation: `Policy deductible of ₹${dedAmount.toLocaleString('en-IN')} applied against bill amount.`,
          impact: 'deduction',
        })
      }
    }

    // ─── 3D. CO-PAYMENT ───────────────────────────────────────────────────────
    const coPayRules = compiledRules.filter(r => r.ruleType === 'COPAY')

    for (const cRule of coPayRules) {
      const coPayPct = cRule.effect.percentage
      if (coPayPct && coPayPct > 0 && runningCovered > 0) {
        // Check age condition if present
        const ageCondition = cRule.conditions.find(c => c.type === 'age')
        let conditionMet = true

        if (ageCondition && ageCondition.value) {
          if (scenario.age === undefined) {
            missingInformation.push({
              id: 'mf_patient_age',
              field: 'age',
              label: 'Patient Age',
              whyItMatters: `Co-pay clause specifies ${coPayPct}% deduction for age ${ageCondition.value}+.`,
              impact: 'changes_copay',
              suggestedInputType: 'number',
              defaultValue: 30,
            })
            conditionMet = false
          } else {
            conditionMet = scenario.age >= ageCondition.value
          }
        }

        if (conditionMet) {
          const deduction = Math.round(runningCovered * (coPayPct / 100))
          runningCovered -= deduction
          runningMin = Math.max(0, Math.round(runningMin * (1 - coPayPct / 100)))
          runningMax = Math.max(0, Math.round(runningMax * (1 - coPayPct / 100)))

          ledger.push({
            id: `ded_copay_${cRule.id}`,
            ruleId: cRule.id,
            ruleName: cRule.ruleName,
            category: 'Co-payment',
            ruleType: 'COPAY',
            originalAmount: runningCovered + deduction,
            deductionAmount: deduction,
            coveredAmountAfter: runningCovered,
            evidence: cRule.evidence,
            calculation: `${coPayPct}% co-pay on admissible amount ₹${(runningCovered + deduction).toLocaleString('en-IN')}${ageCondition ? ` (Patient age ${scenario.age} >= ${ageCondition.value})` : ''}`,
            impact: 'deduction',
          })
        }
      }
    }

    // ─── 3E. SUM INSURED CEILING ──────────────────────────────────────────────
    if (effectiveSumInsured && effectiveSumInsured > 0 && runningCovered > effectiveSumInsured) {
      const deduction = runningCovered - effectiveSumInsured
      runningCovered = effectiveSumInsured
      runningMax = Math.min(runningMax, effectiveSumInsured)
      runningMin = Math.min(runningMin, effectiveSumInsured)

      ledger.push({
        id: 'ded_sum_insured_ceiling',
        ruleName: 'Sum Insured Ceiling',
        category: 'Sum Insured',
        ruleType: 'SUM_INSURED',
        originalAmount: runningCovered + deduction,
        deductionAmount: deduction,
        coveredAmountAfter: runningCovered,
        evidence: {
          page: null,
          quote: `Available sum insured capped at ₹${effectiveSumInsured.toLocaleString('en-IN')}.`,
        },
        calculation: `Covered amount limited to available policy sum insured of ₹${effectiveSumInsured.toLocaleString('en-IN')}`,
        impact: 'cap',
      })
    }
  }

  // ─── 4. CLAIM READINESS CHECKLIST (Blueprint Section 11) ───────────────────
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

  // Calculate evidence coverage (% of impactful rules with verified evidence)
  const impactfulRules = compiledRules.filter(r => r.usability === 'executable')
  const verifiedCount = impactfulRules.filter(r => r.verification === 'verified').length
  const evidenceCoverage = impactfulRules.length > 0
    ? Math.round((verifiedCount / impactfulRules.length) * 100)
    : 100

  // Calculate out of pocket amounts
  const oopAvg = Math.max(0, costDetails.avg - runningCovered)
  const oopMin = Math.max(0, costDetails.min - runningMax)
  const oopMax = Math.max(0, costDetails.max - runningMin)

  const finalStatus: CoverageResult['status'] =
    status === 'cannot_determine' ? 'cannot_determine' :
    !waitingPeriodMet || isExcluded ? 'not_eligible' :
    runningCovered > 0 && oopAvg > 0 ? 'conditional' :
    'eligible'

  const costConfidence: 'high' | 'medium' | 'low' =
    costDetails.costSource === 'hospital_quote' ? 'high' :
    costDetails.costSource === 'manual_quote' ? 'high' :
    costDetails.costSource === 'ml_model'
      ? (costDetails.costModel?.uncertaintyLevel === 'high' ? 'low' : 'medium')
    : costDetails.costSource === 'benchmark' ? 'medium' : 'low'

  const coverageConfidence: 'high' | 'medium' | 'low' =
    evidenceCoverage >= 75 && missingInformation.length === 0 ? 'high' :
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
      min: runningMin,
      typical: runningCovered,
      max: runningMax,
    },
    patientShare: {
      min: oopMin,
      typical: oopAvg,
      max: oopMax,
    },
    costSource: costDetails.costSource,
    costModel: costDetails.costModel,
    ledger,
    missingInformation,
    assumptions,
    evidenceCoverage,
    confidence: overallConfidence,
    costConfidence,
    coverageConfidence,
    waitingPeriodMet,
    waitingPeriodDetails,
    lineItems: costDetails.lineItems,
    readinessChecklist,
    milestones,
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
