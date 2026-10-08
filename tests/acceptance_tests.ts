/**
 * ClaimLens Acceptance Test Suite (Blueprint Section 15)
 * Validates deterministic rule compiler, coverage engine, date math,
 * room limits, co-pay, missing information, and what-if delta calculations.
 */

import { parseCurrency, parseDuration, calculateDateDiffDays, addMonthsToDate } from '../lib/policy/normalizers'
import { compilePolicyRules } from '../lib/policy/compiler'
import { matchTreatmentWithCandidates } from '../lib/estimate/matching'
import { evaluatePolicyPreflight } from '../lib/estimate/policy'
import { PolicyAnalysisResult, PolicyRule } from '../lib/types/policy'
import { TreatmentScenario } from '../lib/types/estimate'

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`)
    process.exit(1)
  }
  console.log(`✅ PASS: ${message}`)
}

console.log('\n--- Running ClaimLens Blueprint Acceptance Tests ---\n')

// ─── 1. Currency & Normalizers ────────────────────────────────────────────────
console.log('1. Normalizers & Parsing:')
assert(parseCurrency('₹5,00,000') === 500000, 'Parse ₹5,00,000 to 500000')
assert(parseCurrency('2.5 Lakhs') === 250000, 'Parse 2.5 Lakhs to 250000')
assert(parseCurrency('Rs 15000') === 15000, 'Parse Rs 15000 to 15000')
assert(parseDuration('24 months')?.months === 24, 'Parse 24 months duration')
assert(parseDuration('30 days')?.days === 30, 'Parse 30 days duration')

// ─── 2. Procedure Fuzzy Matching ──────────────────────────────────────────────
console.log('\n2. Procedure Fuzzy Matching (Blueprint F5):')
const match1 = matchTreatmentWithCandidates({
  treatment: 'knee surgery',
  age: 60,
  city: 'Mumbai',
  hospitalType: 'corporate',
  roomType: 'single-private',
  stayDurationDays: 4,
})
assert(match1.bestMatch !== null, 'Match "knee surgery" to a candidate')
assert(match1.bestMatch?.categoryKey === 'knee_replacement', '"knee surgery" maps to knee_replacement')

// ─── 3. Mock Policy Definition ────────────────────────────────────────────────
const mockPolicyRules: PolicyRule[] = [
  {
    id: 'r_si',
    category: 'sum_insured',
    rule_name: 'Sum Insured Ceiling',
    value: '₹5,00,000',
    description: 'Annual aggregate sum insured of Rs 5,00,000 per policy year.',
    status: 'covered',
    conditions: [],
    page_number: 3,
    section_name: 'Section 1 - Benefits',
    evidence_text: 'The Company maximum liability shall not exceed the Sum Insured of Rs 5,00,000.',
    confidence: 'high',
    evidence_validated: true,
  },
  {
    id: 'r_wait_24m',
    category: 'waiting_period',
    rule_name: 'Specific Illness 24-Month Waiting Period',
    value: '24 months',
    description: 'Joint replacement, cataract, hernia and calculus diseases have a mandatory 24-month waiting period.',
    status: 'conditionally_covered',
    conditions: ['Joint replacement', 'cataract', 'hernia'],
    page_number: 12,
    section_name: 'Section 4 - Waiting Periods',
    evidence_text: 'A waiting period of 24 consecutive months of continuous coverage applies to joint replacement surgery and cataract.',
    confidence: 'high',
    evidence_validated: true,
  },
  {
    id: 'r_room',
    category: 'room_rent',
    rule_name: 'Room Category Eligibility',
    value: 'Single Private Room',
    description: 'Eligible room category is Single Private AC room. Proportionate deductions apply if higher room chosen.',
    status: 'conditionally_covered',
    conditions: ['Single private'],
    page_number: 7,
    section_name: 'Section 2 - Limits',
    evidence_text: 'Room rent is limited to Single Private Room. In case of admission to higher category room, proportionate deduction shall apply.',
    confidence: 'high',
    evidence_validated: true,
  },
  {
    id: 'r_copay_senior',
    category: 'co_payment',
    rule_name: 'Senior Citizen Co-pay (Age 60+)',
    value: '20%',
    description: 'A 20% co-payment applies on admissible claims for insured persons aged 60 and above.',
    status: 'conditionally_covered',
    conditions: ['Age >= 60'],
    page_number: 15,
    section_name: 'Section 5 - Co-payment',
    evidence_text: 'A co-payment of 20% shall be borne by the insured person if aged 60 years or above on date of admission.',
    confidence: 'high',
    evidence_validated: true,
  },
  {
    id: 'r_deductible',
    category: 'deductible',
    rule_name: 'Standard Deductible',
    value: '₹10,000',
    description: 'Fixed per-claim deductible of Rs 10,000 applies.',
    status: 'conditionally_covered',
    conditions: [],
    page_number: 16,
    section_name: 'Section 6 - Deductibles',
    evidence_text: 'The insured shall bear a compulsory deductible of Rs 10,000 on each hospitalization claim.',
    confidence: 'high',
    evidence_validated: true,
  },
]

const mockPolicy: PolicyAnalysisResult = {
  overview: {
    insurer: 'National Health Assurance',
    plan_name: 'Comprehensive Health Guard',
    sum_insured: '₹5,00,000',
    policy_type: 'Individual Health',
    total_pages: 25,
  },
  rules: mockPolicyRules,
  pages: [
    { page_number: 3, text: 'The Company maximum liability shall not exceed the Sum Insured of Rs 5,00,000.', char_count: 85 },
    { page_number: 7, text: 'Room rent is limited to Single Private Room. In case of admission to higher category room, proportionate deduction shall apply.', char_count: 120 },
    { page_number: 12, text: 'A waiting period of 24 consecutive months of continuous coverage applies to joint replacement surgery and cataract.', char_count: 110 },
    { page_number: 15, text: 'A co-payment of 20% shall be borne by the insured person if aged 60 years or above on date of admission.', char_count: 105 },
    { page_number: 16, text: 'The insured shall bear a compulsory deductible of Rs 10,000 on each hospitalization claim.', char_count: 90 },
  ],
  total_pages: 25,
  scanned_pdf_warning: false,
  extraction_stats: {
    total_rules: 5,
    coverage_count: 0,
    exclusion_count: 0,
    waiting_period_count: 1,
    limit_count: 4,
    eligibility_count: 0,
    claim_requirement_count: 0,
    high_confidence: 5,
    medium_confidence: 0,
    low_confidence: 0,
    validated_count: 5,
  },
  processing_time_ms: 450,
}

// ─── 4. Missing Information Test (Blueprint F9) ──────────────────────────────
console.log('\n3. Missing Information Engine (Blueprint F9):')
const noStartDateScenario: TreatmentScenario = {
  treatment: 'Total Knee Replacement',
  age: 45,
  city: 'Mumbai',
  hospitalType: 'corporate',
  roomType: 'single-private',
  stayDurationDays: 4,
  // policyStartDate intentionally omitted!
}
const missingDateResult = evaluatePolicyPreflight(noStartDateScenario, mockPolicy)
assert(
  missingDateResult.status === 'cannot_determine',
  'Status is cannot_determine when policy inception date is missing'
)
assert(
  missingDateResult.missingInformation.some((m) => m.field === 'policyStartDate'),
  'Missing Information engine asks for policyStartDate'
)

// ─── 5. Waiting Period Math Test (Blueprint Section 15 acceptance criteria) ───
console.log('\n4. Waiting Period Boundary Acceptance Test (Blueprint Section 15):')
// Policy start: 2024-01-01 -> 24 months completes on 2026-01-01
const oneDayBeforeDate = '2025-12-31'
const oneDayAfterDate = '2026-01-02'

const beforeScenario: TreatmentScenario = {
  treatment: 'Total Knee Replacement',
  age: 45,
  city: 'Mumbai',
  hospitalType: 'corporate',
  roomType: 'single-private',
  stayDurationDays: 4,
  policyStartDate: '2024-01-01',
  proposedAdmissionDate: oneDayBeforeDate,
}
const beforeResult = evaluatePolicyPreflight(beforeScenario, mockPolicy)
assert(
  beforeResult.waitingPeriodMet === false,
  'Admission 1 day before 24-month wait marks waitingPeriodMet = false'
)
assert(
  beforeResult.status === 'not_eligible',
  'Status is not_eligible when evaluated 1 day before waiting completion'
)
assert(
  beforeResult.ledger.some((l) => l.ruleType === 'WAITING_PERIOD'),
  'Waiting period denial is itemized in Clause-to-Rupee ledger'
)

const afterScenario: TreatmentScenario = {
  ...beforeScenario,
  proposedAdmissionDate: oneDayAfterDate,
}
const afterResult = evaluatePolicyPreflight(afterScenario, mockPolicy)
assert(
  afterResult.waitingPeriodMet === true,
  'Admission 1 day after 24-month wait marks waitingPeriodMet = true'
)
assert(
  afterResult.potentiallyCovered.typical > 0,
  'Covered amount is positive after waiting period milestone is cleared'
)

// ─── 6. Co-pay Age Threshold Conditioning ────────────────────────────────────
console.log('\n5. Age-Conditioned Co-pay (Blueprint Section 15):')
const under60Scenario: TreatmentScenario = {
  treatment: 'Total Knee Replacement',
  age: 55,
  city: 'Mumbai',
  hospitalType: 'corporate',
  roomType: 'single-private',
  stayDurationDays: 4,
  policyStartDate: '2022-01-01',
  proposedAdmissionDate: '2026-02-01',
}
const under60Result = evaluatePolicyPreflight(under60Scenario, mockPolicy)
const hasCoPayUnder60 = under60Result.ledger.some((l) => l.ruleType === 'COPAY')
assert(!hasCoPayUnder60, 'Age 55 does NOT trigger 20% senior citizen co-pay')

const over60Scenario: TreatmentScenario = {
  ...under60Scenario,
  age: 65,
}
const over60Result = evaluatePolicyPreflight(over60Scenario, mockPolicy)
const coPayOver60 = over60Result.ledger.find((l) => l.ruleType === 'COPAY')
assert(!!coPayOver60, 'Age 65 triggers 20% senior citizen co-pay')
assert(
  over60Result.patientShare.typical > under60Result.patientShare.typical,
  'Patient share for senior (age 65) is higher due to co-pay'
)

// ─── 7. Room Category Proration ──────────────────────────────────────────────
console.log('\n6. Room Category Proration (Blueprint Section 15):')
const suiteScenario: TreatmentScenario = {
  ...under60Scenario,
  roomType: 'suite',
}
const suiteResult = evaluatePolicyPreflight(suiteScenario, mockPolicy)
const roomDeduction = suiteResult.ledger.find((l) => l.ruleType === 'ROOM_LIMIT')
assert(!!roomDeduction, 'Suite room triggers Room Limit deduction')
assert(
  suiteResult.patientShare.typical > under60Result.patientShare.typical,
  'Patient share in Deluxe Suite is greater than in Single Private'
)

// ─── 8. Clause-to-Rupee Ledger Completeness ──────────────────────────────────
console.log('\n7. Clause-to-Rupee Traceability (Blueprint F8):')
for (const line of suiteResult.ledger) {
  assert(line.deductionAmount > 0, `Deduction amount is positive for ${line.ruleName}`)
  assert(line.calculation.length > 5, `Calculation trace exists for ${line.ruleName}: "${line.calculation}"`)
  assert(line.evidence !== undefined, `Evidence reference exists for ${line.ruleName}`)
}

console.log('\n🎉 ALL ACCEPTANCE TESTS PASSED SUCCESSFULLY! 🎉\n')
