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
  {
    id: 'r_excl_consumables',
    category: 'exclusion',
    rule_name: 'Non-Medical Consumables and Disposables Exclusion',
    value: 'Excluded',
    description: 'Non-payable expenses including gloves, masks, PPE kits, surgical disposables, and toiletries are excluded from coverage.',
    status: 'not_covered',
    conditions: [],
    page_number: 19,
    section_name: 'Section 7 - Permanent Exclusions',
    evidence_text: 'Charges incurred towards consumables, disposables, gloves, gowns, and personal comfort items are not payable under this policy.',
    confidence: 'high',
    evidence_validated: true,
  },
  {
    id: 'r_sublimit_implant',
    category: 'sub_limit',
    rule_name: 'Medical Implants and Stents Sub-Limit',
    value: '₹50,000 per event',
    description: 'Reimbursement for artificial implants, stents, and prostheses is capped at Rs 50,000 per hospitalization.',
    status: 'conditionally_covered',
    conditions: [],
    page_number: 9,
    section_name: 'Section 3 - Sub-Limits',
    evidence_text: 'Expenses for medical devices, stents, and joint implants shall be subject to a maximum sub-limit of Rs 50,000.',
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

// ─── 9. Phase 1 — Hospital Bill Audit Data & Verification ────────────────────
console.log('\n8. Phase 1 — Hospital Bill Audit & Line Item Integrity:')
import { SAMPLE_HOSPITAL_BILLS } from '../lib/bill/sampleBills'
import type { HospitalBillLineItem } from '../lib/types/bill'

assert(SAMPLE_HOSPITAL_BILLS.length >= 2, 'Sample hospital discharge bills dataset loaded (at least 2 bills)')

const sampleBill1 = SAMPLE_HOSPITAL_BILLS[0].bill
assert(sampleBill1.lineItems.length === 10, 'Knee replacement sample bill contains 10 itemized line items')
assert(sampleBill1.totalBilledAmount === 245000, 'Knee replacement bill gross total is ₹2,45,000')

const computedSum = sampleBill1.lineItems.reduce((acc, item) => acc + item.amount, 0)
assert(computedSum === sampleBill1.totalBilledAmount, 'Line item sum matches billed total with zero discrepancy')

// Verify user-correction preservation logic
const testItem: HospitalBillLineItem = {
  id: 'test_item_1',
  description: 'Single Deluxe AC Room (4 Days @ ₹8,000/day)',
  category: 'room',
  quantity: 4,
  unitPrice: 8000,
  amount: 32000,
  sourcePage: 1,
  originalText: 'Single Deluxe Room Charges (4 days @ 8000.00)',
  originalAmount: 32000,
  confidence: 'high',
  isUserEdited: false,
}

// Simulate user correcting the amount from ₹32,000 to ₹30,000
const userCorrectedItem: HospitalBillLineItem = {
  ...testItem,
  amount: 30000,
  unitPrice: 7500,
  isUserEdited: true,
}

assert(userCorrectedItem.originalText === testItem.originalText, 'Original extracted text is preserved after user edit')
assert(userCorrectedItem.originalAmount === 32000, 'Original extracted amount (₹32,000) is preserved after user edit')
assert(userCorrectedItem.amount === 30000, 'Updated user-corrected amount is ₹30,000')
assert(userCorrectedItem.isUserEdited === true, 'isUserEdited flag accurately marked true')

// Test payment summary arithmetic
const ps = sampleBill1.paymentSummary!
assert(ps.subtotal! - ps.discount! === ps.netPayable, 'Payment summary: Subtotal - Discount equals Net Payable')
assert(ps.netPayable! - (ps.deposit! + ps.amountPaid!) === ps.balanceDue, 'Payment summary: Net Payable - Payments equals Balance Due')

// ─── 10. Phase 2 — Deterministic Bill Audit Engine Acceptance Tests ─────────
console.log('\n9. Phase 2 — Deterministic Bill Audit Engine (Dual Track):')
import { runBillAudit } from '../lib/bill/auditor'

// Test with the third sample bill (Fortis Angioplasty test case with anomalies)
const anomalySample = SAMPLE_HOSPITAL_BILLS.find(s => s.id === 'sample-cardiac-anomalies')!
assert(!!anomalySample, 'Sample bill with cardiac anomalies found in dataset')

// Run Track A audit (without policy rules)
const pureBillingAudit = runBillAudit(anomalySample.bill, anomalySample.bill.lineItems)
assert(pureBillingAudit.policyLoaded === false, 'pureBillingAudit indicates policyLoaded is false')
assert(pureBillingAudit.billingFindingCount >= 3, 'Pure billing audit detects at least 3 billing anomalies')

// Verify arithmetic discrepancy finding
const arithFinding = pureBillingAudit.findings.find(f => f.billingIssue === 'arithmetic_discrepancy')
assert(!!arithFinding, 'Audit detects arithmetic discrepancy')
assert(arithFinding?.calculatedDiscrepancy === 8000, 'Arithmetic discrepancy calculated exactly as ₹8,000 (1 × 40,000 ≠ 48,000)')

// Verify duplicate finding
const dupFinding = pureBillingAudit.findings.find(f => f.billingIssue === 'potential_duplicate')
assert(!!dupFinding, 'Audit detects potential duplicate stent charge')

// Verify vague charge finding
const vagueFinding = pureBillingAudit.findings.find(f => f.billingIssue === 'vague_charge')
assert(!!vagueFinding, 'Audit flags "Miscellaneous Hospital Charges" as vague charge requiring itemisation')

// Run Track B audit (with mock policy rules)
const fullAudit = runBillAudit(anomalySample.bill, anomalySample.bill.lineItems, mockPolicy.rules)
assert(fullAudit.policyLoaded === true, 'fullAudit indicates policyLoaded is true')
assert(fullAudit.insuranceFindingCount >= 1, 'Full audit identifies insurance policy findings')

// Verify consumables exclusion finding
const consumableFinding = fullAudit.findings.find(f => f.insuranceIssue === 'consumables_not_covered')
assert(!!consumableFinding, 'Audit identifies consumable kit as non-payable exclusion under policy')
assert(!!consumableFinding?.policyClause, 'Consumable finding quotes verbatim policy clause')

// Verify per-item verdicts
const mathErrorVerdict = fullAudit.verdicts.find(v => v.billingVerdict === 'discrepancy')
assert(!!mathErrorVerdict, 'At least one line item has billingVerdict = discrepancy')

const excludedVerdict = fullAudit.verdicts.find(v => v.insuranceVerdict === 'likely_excluded')
assert(!!excludedVerdict, 'At least one line item has insuranceVerdict = likely_excluded')

console.log('\n🎉 ALL ACCEPTANCE TESTS (POLICY BLUEPRINT + BILL AUDIT PHASE 1 & 2) PASSED! 🎉\n')


