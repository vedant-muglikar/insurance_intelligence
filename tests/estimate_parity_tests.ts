/**
 * Estimator ⇄ Claim Ledger parity.
 *
 * The Estimator predicts the bill and the Claim Ledger reads a real one, but both decide what the policy pays
 * with the same claim engine (lib/claims/adjudicate). Given the same bill and the same patient, they must
 * produce the same rupees. Run: npx tsx tests/estimate_parity_tests.ts
 */

import { evaluatePolicyPreflight } from '../lib/estimate/policy'
import { adjudicate } from '../lib/claims/adjudicate'
import { makeVersion } from '../lib/claims/versions'
import { SAMPLE_BASE_EFFECTIVE, SAMPLE_CLAIM_BILLS } from '../lib/claims/samples'
import { SAMPLE_POLICIES } from '../lib/policy/samplePolicies'
import { findCanonicalProcedureKey } from '../lib/policy/normalizers'
import type { TreatmentScenario } from '../lib/types/estimate'
import type { PolicyAnalysisResult, PolicyRule } from '../lib/types/policy'
import { compilePolicyRules } from '../lib/policy/compiler'
import { DEMO_CASE, DEMO_POLICY_UIN, demoScenario, isDemoPolicy } from '../lib/demo/preset'

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  PASS ${name}`)
  } else {
    failed++
    console.log(`  FAIL ${name}`, detail !== undefined ? JSON.stringify(detail) : '')
  }
}

const policy = SAMPLE_POLICIES.hdfc_optima
const SI = policy.overview.sum_insured_amount!

/** What the Claim Ledger tab computes for a sample bill */
function ledger(c: (typeof SAMPLE_CLAIM_BILLS)[number], entitledRoomRatePerDay: number | null) {
  const base = makeVersion({ id: 'base', label: 'Base policy', documentName: 'policy.pdf', result: policy, kind: 'base', effectiveFrom: SAMPLE_BASE_EFFECTIVE, synthetic: true })
  return adjudicate({
    items: c.bill.lineItems,
    bill: c.bill,
    versions: [base],
    treatmentDate: c.treatmentDate,
    patientAge: c.patientAge,
    policyStartDate: c.policyStartDate,
    availableSumInsured: SI,
    entitledRoomRatePerDay,
    treatmentKey: findCanonicalProcedureKey(c.bill.diagnosis),
  })
}

/** What the Estimator tab computes for the same stay, with the bill entered as a hospital quote */
function estimator(c: (typeof SAMPLE_CLAIM_BILLS)[number], treatment: string, roomType: TreatmentScenario['roomType'], days: number, entitledRoomRatePerDay?: number) {
  return evaluatePolicyPreflight(
    {
      treatment,
      age: c.patientAge,
      city: 'Mumbai',
      hospitalType: 'private',
      roomType,
      stayDurationDays: days,
      policyStartDate: c.policyStartDate,
      proposedAdmissionDate: c.treatmentDate,
      declaredPED: [],
      availableSumInsured: SI,
      isNetworkHospital: true,
      entitledRoomRatePerDay,
      quoteLineItems: c.bill.lineItems.map((i) => ({ ...i })),
    },
    policy,
  )
}

const [knee, cataract] = SAMPLE_CLAIM_BILLS

console.log('\n1. Same bill, same patient → same rupees')
for (const [label, c, treatment, room, days] of [
  ['knee replacement, deluxe room', knee, 'Total Knee Replacement', 'suite', 4],
  ['cataract, day care', cataract, 'Cataract Surgery', 'general', 1],
] as const) {
  const l = ledger(c, 6000)
  const e = estimator(c, treatment, room, days, 6000)
  check(`${label}: bill ${l.totals.claimed}`, e.treatmentCost.typical === l.totals.claimed, [e.treatmentCost.typical, l.totals.claimed])
  check(`${label}: insurer pays ${l.totals.payable} in both`, e.potentiallyCovered.typical === l.totals.payable, [e.potentiallyCovered.typical, l.totals.payable])
  check(`${label}: you pay ${l.totals.patientPays} in both`, e.patientShare.typical === l.totals.patientPays, [e.patientShare.typical, l.totals.patientPays])
  check(`${label}: held for review ${l.totals.heldForReview} in both`, e.heldForReview === l.totals.heldForReview, [e.heldForReview, l.totals.heldForReview])
  const eByStage: Record<string, number> = {}
  for (const it of e.itemLedger ?? []) for (const d of it.deductions) eByStage[d.stage] = (eByStage[d.stage] ?? 0) + d.amount
  check(`${label}: identical deductions stage by stage`, JSON.stringify(eByStage) === JSON.stringify(l.totals.byStage), [eByStage, l.totals.byStage])
  const ledgerTotal = e.ledger.reduce((a, d) => a + d.deductionAmount, 0)
  check(`${label}: the Estimator's clause ledger adds up to what you pay`, ledgerTotal === e.patientShare.typical, [ledgerTotal, e.patientShare.typical])
}

console.log('\n2. Room above the entitlement, no rupee limit in the policy')
{
  const e = estimator(knee, 'Total Knee Replacement', 'suite', 4)
  const ask = e.missingInformation.find((m) => m.field === 'entitledRoomRatePerDay')
  check('the Estimator asks for the allowed room’s daily rate', !!ask && ask.defaultValue > 0, ask)
  check('…and meanwhile estimates the room deduction from the room-tier price ratio (no flat 40% guess)', e.ledger.some((d) => d.ruleType === 'ROOM_LIMIT' && /Limit ₹5,517 per day/.test(d.calculation)), e.ledger.map((d) => d.calculation))
  const exact = estimator(knee, 'Total Knee Replacement', 'suite', 4, 6000)
  check('with the actual rate entered, the question goes away', !exact.missingInformation.some((m) => m.field === 'entitledRoomRatePerDay'))
  const within = estimator(knee, 'Total Knee Replacement', 'single-private', 4)
  check('a room within the entitlement has no room deduction and no question', !within.ledger.some((d) => d.ruleType === 'ROOM_LIMIT') && !within.missingInformation.some((m) => m.field === 'entitledRoomRatePerDay'))
}

console.log('\n3. Range')
{
  const e = estimator(knee, 'Total Knee Replacement', 'suite', 4, 6000)
  const ordered = (r: { min: number; typical: number; max: number }) => r.min <= r.typical && r.typical <= r.max
  check('bill, insurer share and your share are ordered low ≤ typical ≤ high', ordered(e.treatmentCost) && ordered(e.potentiallyCovered) && ordered(e.patientShare), [e.treatmentCost, e.potentiallyCovered, e.patientShare])
  check('at every point the two shares add up to the bill', e.potentiallyCovered.typical + e.patientShare.typical === e.treatmentCost.typical)
}

console.log('\n4. Demo preset: both tabs open on the same patient and bill')
{
  const pr = (id: string, p: Partial<PolicyRule> & Pick<PolicyRule, 'category' | 'rule_name' | 'value' | 'description' | 'status'>): PolicyRule => ({
    id, conditions: [], page_number: 1, section_name: 's', evidence_text: p.description, confidence: 'high', evidence_validated: true, ...p,
  })
  const rules: PolicyRule[] = [
    pr('rr', { category: 'room_rent', rule_name: 'Room Rent Limit', value: '1% of Basic Sum Insured = ₹5,000.00 per day', description: 'Room rent is limited to 1% of the Basic Sum Insured per day for a single standard room.', status: 'conditionally_covered' }),
    pr('pd', { category: 'sub_limit', rule_name: 'Proportionate Deduction', value: 'Applies to Associated Medical Expenses', description: 'Applies to Associated Medical Expenses if a room costing more than the eligible limit is occupied. Factor = eligible room rent ÷ actual room rent', status: 'conditionally_covered' }),
    pr('sl', { category: 'sub_limit', rule_name: 'Treatment Sub-limits', value: 'Cataract ₹25,000 per eye, Joint replacement ₹50,000, Robotic surgery ₹50,000', description: 'Sub-limits per policy year.', evidence_text: 'Sub-limits (per policy year): Cataract ₹25,000 per eye | Joint replacement implants incl. bone cement ₹50,000 | Robotic surgery ₹50,000', status: 'conditionally_covered' }),
    pr('cp', { category: 'co_payment', rule_name: 'Senior Citizen Co-payment', value: '20% of every admissible claim', description: '20% co-payment applies to every admissible claim where the Insured Person is aged 60 years or above on the date of admission.', status: 'conditionally_covered' }),
    pr('w2', { category: 'waiting_period', rule_name: 'Specific Disease / Procedure Waiting Period', value: '24 months', description: '24 months continuous coverage for cataract, hernia, joint replacement, hysterectomy.', status: 'conditionally_covered' }),
  ]
  const pages = [{ page_number: 1, text: 'Suraksha Comprehensive Health Policy', char_count: 36 }]
  const suraksha: PolicyAnalysisResult = {
    overview: { insurer: 'Suraksha Health Insurance Company Limited', plan_name: 'Suraksha Comprehensive Health Policy (Individual)', sum_insured: '₹5,00,000', sum_insured_amount: 500000, policy_type: 'Individual', total_pages: 10, uin: DEMO_POLICY_UIN },
    rules,
    compiled_rules: compilePolicyRules(rules, pages),
    pages,
    total_pages: 10,
    scanned_pdf_warning: false,
    extraction_stats: {} as PolicyAnalysisResult['extraction_stats'],
    processing_time_ms: 0,
  }
  check('the Suraksha policy is recognised as the demo policy', isDemoPolicy(suraksha))

  // Estimator tab on first open
  const e = evaluatePolicyPreflight(demoScenario(suraksha), suraksha)
  // Claim Ledger tab on first open: the same values ClaimLedger puts in its boxes for the demo policy
  const demoBill = SAMPLE_CLAIM_BILLS.find((c) => c.id === DEMO_CASE.billId)!.bill
  const base = makeVersion({ id: 'base', label: 'Base policy', documentName: 'Suraksha.pdf', result: suraksha, kind: 'base', effectiveFrom: DEMO_CASE.policyEffectiveFrom, synthetic: false })
  const l = adjudicate({
    items: demoBill.lineItems, bill: demoBill, versions: [base], treatmentDate: DEMO_CASE.admissionDate, patientAge: DEMO_CASE.patientAge,
    policyStartDate: DEMO_CASE.policyStartDate, availableSumInsured: 500000, entitledRoomRatePerDay: null, treatmentKey: findCanonicalProcedureKey(demoBill.diagnosis),
  })
  check(`same bill: ${l.totals.claimed}`, e.treatmentCost.typical === l.totals.claimed, [e.treatmentCost.typical, l.totals.claimed])
  check(`insurer pays ${l.totals.payable} in both`, e.potentiallyCovered.typical === l.totals.payable, [e.potentiallyCovered.typical, l.totals.payable])
  check(`you pay ${l.totals.patientPays} in both`, e.patientShare.typical === l.totals.patientPays, [e.patientShare.typical, l.totals.patientPays])
  check(`held for review ${l.totals.heldForReview} in both`, e.heldForReview === l.totals.heldForReview, [e.heldForReview, l.totals.heldForReview])
  check('no extra questions in the demo (start date, room rate, conditions all filled)', !e.missingInformation.some((m) => ['policyStartDate', 'entitledRoomRatePerDay', 'declaredPED'].includes(m.field)), e.missingInformation.map((m) => m.field))
}

console.log(`\n${failed === 0 ? 'ALL' : 'SOME'} PARITY TESTS: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
