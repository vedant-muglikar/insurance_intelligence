/**
 * Claim adjudication tests: effective-date reading, version selection and precedence, the item ledger,
 * calculation invariants (nothing deducted twice, every rupee accounted for), and recompute on change.
 * Run: npx tsx tests/claims_tests.ts
 */

import { adjudicate, allocate, diffAdjudications } from '../lib/claims/adjudicate'
import { keywordMatcher, stem, tokens } from '../lib/claims/matcher'
import { SAMPLE_CLAIM_BILLS, sampleVersions } from '../lib/claims/samples'
import { extractEffectiveDate, makeVersion, parseDateToken, selectVersion } from '../lib/claims/versions'
import { compilePolicyRules } from '../lib/policy/compiler'
import type { ExtractedPage, PolicyAnalysisResult, PolicyRule } from '../lib/types/policy'
import type { HospitalBillLineItem } from '../lib/types/bill'

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
const section = (s: string) => console.log(`\n${s}`)

const page = (n: number, text: string): ExtractedPage => ({ page_number: n, text, char_count: text.length })

function result(rules: PolicyRule[], pages: ExtractedPage[]): PolicyAnalysisResult {
  return {
    overview: { insurer: 'Test', plan_name: 'Test plan', sum_insured: '', policy_type: '', total_pages: pages.length },
    rules,
    compiled_rules: compilePolicyRules(rules, pages),
    pages,
    total_pages: pages.length,
    scanned_pdf_warning: false,
    extraction_stats: {} as PolicyAnalysisResult['extraction_stats'],
    processing_time_ms: 0,
  }
}

function pr(id: string, p: Partial<PolicyRule> & Pick<PolicyRule, 'category' | 'rule_name' | 'value' | 'description' | 'status'>): PolicyRule {
  return { id, conditions: [], page_number: 1, section_name: 's', evidence_text: p.description, confidence: 'high', evidence_validated: true, ...p }
}

function item(id: string, description: string, category: HospitalBillLineItem['category'], amount: number, quantity = 1): HospitalBillLineItem {
  return { id, description, category, quantity, unitPrice: quantity > 1 ? Math.round(amount / quantity) : amount, amount, confidence: 'high' }
}

const { base, amendment } = sampleVersions()
const knee = SAMPLE_CLAIM_BILLS[0]
const cataract = SAMPLE_CLAIM_BILLS[1]
const run = (c: (typeof SAMPLE_CLAIM_BILLS)[number], date: string, versions = [base, amendment]) =>
  adjudicate({ items: c.bill.lineItems, bill: c.bill, versions, treatmentDate: date, patientAge: c.patientAge, policyStartDate: c.policyStartDate })

// ───────────────────────────────────────────────────────────────────────────────
section('1. Dates and effective-date reading')
check('ISO date', parseDateToken('2026-04-01') === '2026-04-01')
check('day-first numeric', parseDateToken('01/04/2026') === '2026-04-01' && parseDateToken('1-4-2026') === '2026-04-01' && parseDateToken('01.04.2026') === '2026-04-01')
check('day month name', parseDateToken('1st April 2026') === '2026-04-01' && parseDateToken('01 April 2026') === '2026-04-01')
check('month name first', parseDateToken('April 1, 2026') === '2026-04-01')
check('rejects impossible dates', parseDateToken('31/02/2026') === null && parseDateToken('13/13/2026') === null)
{
  const a = extractEffectiveDate([page(1, 'Cover page. This Endorsement is effective from 01/04/2026 and applies to all policies.')])
  check('effective from cue', a.date === '2026-04-01' && a.evidence?.page === 1, a)
  const b = extractEffectiveDate([page(1, 'x'), page(2, 'With effect from 15 June 2025 the following applies.')])
  check('with effect from, second page', b.date === '2025-06-15' && b.evidence?.page === 2, b)
  const c = extractEffectiveDate([page(1, 'Policy period 01/04/2025 to 31/03/2026. No effective statement.')])
  check('no cue means no date (never guessed)', c.date === null, c)
  check('amendment effective date from the sample text', amendment.effectiveFrom === '2026-04-01')
}

// ───────────────────────────────────────────────────────────────────────────────
section('2. Version selection and precedence')
{
  const before = selectVersion([base, amendment], '2026-02-10')
  check('before the effective date only the base applies', before.inForce.join() === 'base' && before.changes.length === 0, before.inForce)
  const onDay = selectVersion([base, amendment], '2026-04-01')
  check('effective date itself is in force', onDay.inForce.join() === 'base,endorsement-1')
  const after = selectVersion([base, amendment], '2026-05-12')
  check('after: base then endorsement', after.inForce.join() === 'base,endorsement-1')
  check(
    'amendment replaces room and co-pay, adds exclusion and coverage',
    after.changes.filter((c) => c.kind === 'replaced').map((c) => c.ruleType).sort().join() === 'COPAY,ROOM_LIMIT' &&
      after.changes.filter((c) => c.kind === 'added').map((c) => c.ruleType).sort().join() === 'EXCLUSION,GENERAL_CLAUSE',
    after.changes.map((c) => `${c.kind}:${c.ruleType}`),
  )
  check('replaced rules carry what they replaced', after.rules.filter((r) => r.supersedes).length === 2)
  check('merged rule count is base plus added', after.rules.length === base.compiled.length + 2)

  const noDate = selectVersion([base, amendment], null)
  check('no treatment date applies base only and warns', noDate.inForce.join() === 'base' && noDate.warnings.some((w) => /treatment date/i.test(w)))

  const undated = { ...amendment, id: 'undated', label: 'Undated endorsement', effectiveFrom: null }
  const u = selectVersion([base, undated], '2026-09-01')
  check('an amendment with no effective date is not applied', u.inForce.join() === 'base' && u.warnings.some((w) => /no effective date/i.test(w)), u)

  const ended = { ...amendment, id: 'ended', label: 'Ended', effectiveTo: '2026-06-30' }
  check('an amendment past its end date is not applied', selectVersion([base, ended], '2026-07-15').inForce.join() === 'base')

  // A later amendment replaces an earlier amendment's rule on the same topic.
  const later = makeVersion({
    id: 'endorsement-2',
    label: 'Endorsement 2',
    documentName: 'Endorsement 2.pdf',
    kind: 'amendment',
    effectiveFrom: '2026-07-01',
    result: result(
      [pr('e2_copay', { category: 'co_payment', rule_name: 'Senior Citizen Co-pay (Age 60+) revised again', value: '30%', description: 'A 30% co-payment applies to admissible claim if patient age is 60 or above.', status: 'conditionally_covered' })],
      [page(1, 'Endorsement 2')],
    ),
  })
  const both = selectVersion([base, amendment, later], '2026-08-01')
  const copay = both.rules.find((r) => r.rule.ruleType === 'COPAY')!
  check('latest amendment wins on a topic', copay.versionId === 'endorsement-2' && copay.rule.effect.percentage === 30 && copay.supersedes?.versionId === 'endorsement-1', copay.versionId)
  const mid = selectVersion([base, amendment, later], '2026-05-01')
  check('between the two, the first amendment still wins', mid.rules.find((r) => r.rule.ruleType === 'COPAY')!.versionId === 'endorsement-1')

  const early = selectVersion([{ ...base, effectiveFrom: '2025-04-01' }], '2024-01-01')
  check('a treatment before the base policy starts is flagged', early.warnings.some((w) => /before the base policy/i.test(w)))
}

// ───────────────────────────────────────────────────────────────────────────────
section('3. Matcher unit checks')
{
  check('stemming', stem('gloves') === 'glove' && stem('syringes') === 'syringe' && stem('charges') === 'charge')
  check('generic words are dropped', !tokens('Surgical charges for the patient').includes('surgical'))
  const rules = selectVersion([base, amendment], '2026-05-12').rules
  const m = keywordMatcher.match({ text: 'Disposable surgical gloves and masks', category: 'consumables', rules })
  check('paraphrase links to the consumables exclusion', m[0]?.role === 'exclusion' && m[0].matchedTerms.includes('disposable'), m[0])
  check('unrelated text matches no exclusion', keywordMatcher.match({ text: 'Cardiac MRI', category: 'diagnostics', rules }).every((x) => x.role !== 'exclusion'))
}

// ───────────────────────────────────────────────────────────────────────────────
section('4. Supported claim, excluded item, conflicting and missing evidence (knee bill, endorsement in force)')
const kneeAfter = run(knee, '2026-05-12')
const byDesc = (r: typeof kneeAfter, s: string) => r.items.find((i) => i.description.includes(s))!
{
  check('ledger invariants hold', kneeAfter.checks.ok, kneeAfter.checks.messages)
  check('claimed total', kneeAfter.totals.claimed === 337800)
  const implant = byDesc(kneeAfter, 'Prosthesis')
  check('implant is supported: only co-pay applies', implant.status === 'reduced' && implant.deductions.length === 1 && implant.deductions[0].stage === 'copay' && implant.payable === 90000, implant)
  const gloves = byDesc(kneeAfter, 'Gloves')
  check('gloves, masks, PPE are excluded by the new clause', gloves.status === 'excluded' && gloves.payable === 0 && gloves.deductions[0].clauses[0].versionId === 'endorsement-1' && gloves.deductions[0].clauses[0].page === 4, gloves)
  const stapler = byDesc(kneeAfter, 'Stapler')
  check('stapler kit has conflicting evidence and is held, not guessed', stapler.status === 'review' && stapler.heldForReview === 7200 && stapler.review[0].includes('Conflicting evidence') && stapler.deductions[0].clauses.length === 2, stapler)
  const admin = byDesc(kneeAfter, 'Admission')
  check('a charge with no clause is held for review', admin.status === 'review' && admin.review[0].includes('No policy clause'), admin)
  check('excluded item gets no co-pay (no double deduction)', gloves.deductions.every((d) => d.stage === 'exclusion'))
}

// ───────────────────────────────────────────────────────────────────────────────
section('5. Hand-checked arithmetic')
{
  const room = byDesc(kneeAfter, 'Deluxe AC Room')
  // 4 days at Rs 8,000 against a Rs 5,000 cap: excess 3,000 x 4 = 12,000
  check('room excess 12,000', room.deductions.find((d) => d.stage === 'room_rent')?.amount === 12000)
  // proportionate: 5,000 / 8,000 = 62.5% of OT 45,000 is payable, so 16,875 removed
  check('proportionate deduction on OT 16,875', byDesc(kneeAfter, 'Operation Theatre').deductions.find((d) => d.stage === 'room_rent')?.amount === 16875)
  check('room_rent total 58,800', kneeAfter.totals.byStage.room_rent === 58800)
  check('exclusion total 11,300', kneeAfter.totals.byStage.exclusion === 11300)
  check('held for review 9,700', kneeAfter.totals.heldForReview === 9700 && kneeAfter.totals.byStage.review_hold === 9700)
  // remaining 337,800 - 11,300 - 9,700 - 58,800 = 258,000; 25% co-pay = 64,500
  check('co-pay is 25% of what remains, taken once: 64,500', kneeAfter.totals.byStage.copay === 64500)
  check('payable 193,500', kneeAfter.totals.payable === 193500 && kneeAfter.totals.patientPays === 144300, kneeAfter.totals)
  const per = kneeAfter.items.reduce((a, i) => a + i.payable, 0)
  check('item payables add up to the total', per === kneeAfter.totals.payable)
}

// ───────────────────────────────────────────────────────────────────────────────
section('6. Policy version change: before and after ledgers')
const kneeBefore = run(knee, '2026-02-10')
{
  check('before: base only, ledger valid', kneeBefore.selection.inForce.join() === 'base' && kneeBefore.checks.ok, kneeBefore.checks.messages)
  // 337,800 claimed - 4,300 held (admission fee and comfort kit have no clause) = 333,500; 20% = 66,700
  check('before: 20% co-pay (base clause) on what remains, no exclusion', kneeBefore.totals.byStage.copay === 66700 && !kneeBefore.totals.byStage.exclusion && kneeBefore.totals.heldForReview === 4300, kneeBefore.totals)
  check('before: payable 266,800', kneeBefore.totals.payable === 266800, kneeBefore.totals)
  check('before: room rent clause has no rupee limit, so it is flagged for review', byDesc(kneeBefore, 'Deluxe AC Room').review.some((r) => /rupee limit/i.test(r)) && kneeBefore.warnings.some((w) => /Room-rent/i.test(w)))
  const d = diffAdjudications(kneeBefore, kneeAfter)
  check('the amendment lowers the payable amount by 73,300', d.change === -73300 && d.payableBefore === 266800 && d.payableAfter === 193500, d)
  check('diff counts changed items', d.changedItems >= 10)
  const sameDay = run(knee, '2026-05-12', [base])
  check('same bill without the amendment loaded equals the "before" ledger', sameDay.totals.payable === kneeBefore.totals.payable)
}

section('7. Supported claim (cataract) under both versions')
{
  const cb = run(cataract, '2026-02-10')
  const ca = run(cataract, '2026-05-20')
  check('both ledgers valid', cb.checks.ok && ca.checks.ok, [cb.checks.messages, ca.checks.messages])
  check('cataract sub-limit removes 29,200 in both', cb.totals.byStage.sub_limit === 29200 && ca.totals.byStage.sub_limit === 29200)
  check('before: 20% co-pay, payable 33,200', cb.totals.payable === 33200, cb.totals)
  check('after: 25% co-pay, payable 31,125', ca.totals.payable === 31125, ca.totals)
}

// ───────────────────────────────────────────────────────────────────────────────
section('8. Waiting period, deductible and sum-insured cap (custom rules)')
{
  const rules: PolicyRule[] = [
    pr('w1', { category: 'waiting_period', rule_name: 'Joint replacement 24-month waiting period', value: '24 months', description: 'Joint replacement is covered only after 24 months of continuous coverage.', status: 'conditionally_covered' }),
    pr('d1', { category: 'deductible', rule_name: 'Voluntary deductible', value: '₹10,000', description: 'A deductible of Rs 10,000 applies to every claim.', status: 'conditionally_covered' }),
    pr('s1', { category: 'sum_insured', rule_name: 'Sum insured', value: '₹1,00,000', description: 'Maximum liability is a sum insured of Rs 1,00,000.', status: 'covered' }),
  ]
  const v = makeVersion({ id: 'b', documentName: 'p.pdf', kind: 'base', effectiveFrom: '2025-01-01', result: result(rules, [page(1, 'p')]) })
  const items = [item('a', 'Knee replacement surgery charges', 'surgery', 90000), item('b', 'Implant', 'implant', 60000), item('c', 'Medicines', 'medicines', 7001)]
  const ok = adjudicate({ items, versions: [v], treatmentDate: '2026-06-01', policyStartDate: '2023-01-01' })
  check('valid ledger', ok.checks.ok, ok.checks.messages)
  check('deductible taken once: 10,000', ok.totals.byStage.deductible === 10000)
  // claimed 157,001 - deductible 10,000 = 147,001; capped at 100,000: 47,001 removed
  check('sum insured cap applies after the deductible', ok.totals.byStage.sum_insured === 47001 && ok.totals.payable === 100000, ok.totals)
  const waiting = adjudicate({ items, versions: [v], treatmentDate: '2024-06-01', policyStartDate: '2023-01-01', patientAge: 40 })
  check('waiting period not yet elapsed makes everything non-payable', waiting.totals.payable === 0 && waiting.items.every((i) => i.status === 'excluded'), waiting.totals)
  check('the clause is cited', waiting.items[0].deductions[0].stage === 'waiting_period' && waiting.items[0].deductions[0].clauses[0].ruleId === 'w1')
  const noStart = adjudicate({ items, versions: [v], treatmentDate: '2024-06-01' })
  check('missing policy start date is flagged, waiting period not guessed', noStart.warnings.some((w) => /policy start date/i.test(w)) && noStart.totals.byStage.waiting_period === undefined)
}

// ───────────────────────────────────────────────────────────────────────────────
section('9. Missing inputs are flagged, never guessed')
{
  const noAge = adjudicate({ items: knee.bill.lineItems, versions: [base, amendment], treatmentDate: '2026-05-12', policyStartDate: knee.policyStartDate })
  check('co-pay with an age condition is not applied without an age, and says so', noAge.totals.byStage.copay === undefined && noAge.warnings.some((w) => /age was not given/i.test(w)), noAge.warnings)
  const young = adjudicate({ items: knee.bill.lineItems, versions: [base, amendment], treatmentDate: '2026-05-12', patientAge: 45, policyStartDate: knee.policyStartDate })
  check('a patient under the age threshold pays no co-pay', young.totals.byStage.copay === undefined)
  const rate = adjudicate({ items: knee.bill.lineItems, versions: [base], treatmentDate: '2026-02-10', patientAge: 64, entitledRoomRatePerDay: 6000, policyStartDate: knee.policyStartDate })
  check('with the entitled room rate supplied the base room clause applies', rate.totals.byStage.room_rent === 8000, rate.totals.byStage)
}

// ───────────────────────────────────────────────────────────────────────────────
section('10. Recompute on change')
{
  const a = run(knee, '2026-05-12')
  const b = run(knee, '2026-05-12')
  check('same inputs give identical output', JSON.stringify(a.totals) === JSON.stringify(b.totals) && JSON.stringify(a.items) === JSON.stringify(b.items))
  const edited = knee.bill.lineItems.map((i) => (i.id === 'item_4' ? { ...i, amount: 80000, unitPrice: 80000 } : i))
  const c = adjudicate({ items: edited, versions: [base, amendment], treatmentDate: '2026-05-12', patientAge: 64, policyStartDate: knee.policyStartDate })
  check('editing a bill item recomputes everything downstream', c.totals.claimed === 357800 && c.totals.payable !== a.totals.payable && c.checks.ok, c.totals)
  const withoutItem = adjudicate({ items: knee.bill.lineItems.filter((i) => i.id !== 'item_9'), versions: [base, amendment], treatmentDate: '2026-05-12', patientAge: 64, policyStartDate: knee.policyStartDate })
  check('removing an excluded item leaves the payable amount unchanged', withoutItem.totals.payable === a.totals.payable)
  const moved = run(knee, '2026-03-31')
  check('moving the date back across the effective date switches the version', moved.selection.inForce.join() === 'base' && moved.totals.payable === kneeBefore.totals.payable)
}

// ───────────────────────────────────────────────────────────────────────────────
section('11. Property checks: random bills never break the invariants')
{
  let seed = 12345
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
  const cats: HospitalBillLineItem['category'][] = ['room', 'icu', 'surgery', 'doctor', 'implant', 'medicines', 'diagnostics', 'consumables', 'ambulance', 'other']
  const words = ['room', 'surgeon fee', 'implant', 'gloves', 'disposable kit', 'pharmacy', 'registration', 'cataract lens', 'nursing care', 'suture stapler', 'ct scan', 'ambulance']
  let allOk = true
  let firstBad: unknown = null
  for (let n = 0; n < 300; n++) {
    const count = 1 + Math.floor(rnd() * 14)
    const items = Array.from({ length: count }, (_, k) => {
      const cat = cats[Math.floor(rnd() * cats.length)]
      const amount = Math.floor(rnd() * 150000)
      const days = cat === 'room' ? 1 + Math.floor(rnd() * 6) : 1
      return item(`r${k}`, `${words[Math.floor(rnd() * words.length)]} ${cat === 'room' ? `(${days} Days)` : ''}`, cat, amount, days)
    })
    const date = rnd() < 0.5 ? '2026-02-01' : '2026-06-01'
    const r = adjudicate({ items, versions: [base, amendment], treatmentDate: date, patientAge: Math.floor(rnd() * 90), policyStartDate: '2024-01-01', availableSumInsured: rnd() < 0.3 ? Math.floor(rnd() * 200000) + 1000 : null })
    if (!r.checks.ok) {
      allOk = false
      firstBad ??= { n, messages: r.checks.messages }
    }
  }
  check('300 random bills: every ledger passes its own checks', allOk, firstBad)
  let exact = true
  for (let n = 0; n < 500; n++) {
    const w = Array.from({ length: 1 + Math.floor(rnd() * 9) }, () => Math.floor(rnd() * 100000))
    const sum = w.reduce((a, b) => a + b, 0)
    const total = Math.floor(rnd() * (sum + 1))
    const out = allocate(total, w)
    if (out.reduce((a, b) => a + b, 0) !== Math.min(total, sum) || out.some((v, i) => v > w[i] || v < 0)) exact = false
  }
  check('pro-rata allocation always adds up to the whole rupee', exact)
}

console.log(`\n${failed === 0 ? 'ALL' : 'SOME'} CLAIM TESTS: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
