/**
 * Documented synthetic data for the claim ledger demonstration.
 *
 * PROVENANCE. Nothing here is a real insurer document or a real patient bill.
 *  - Base policy: the bundled HDFC Optima sample (lib/policy/samplePolicies.ts), given a synthetic effective date.
 *  - Endorsement 1: written for this demonstration. It changes three clauses and adds one:
 *      replaces the room-rent clause with a Rs 5,000/day cap and proportionate deduction,
 *      replaces the senior co-pay from 20% to 25%,
 *      adds an exclusion for consumables and disposables,
 *      adds a coverage clause that pays implants and operative consumables (sutures, staplers).
 *    It is effective for admissions on or after 01 April 2026.
 *  - Bills: two synthetic hospital bills with distinct charge categories, each built to exercise one behaviour
 *    (see SAMPLE_CLAIM_BILLS notes). Amounts are round figures chosen so the arithmetic can be checked by hand.
 */

import { SAMPLE_POLICIES } from '@/lib/policy/samplePolicies'
import { compilePolicyRules } from '@/lib/policy/compiler'
import type { ExtractedPage, PolicyAnalysisResult, PolicyRule } from '@/lib/types/policy'
import type { HospitalBill, HospitalBillLineItem } from '@/lib/types/bill'
import { makeVersion } from './versions'
import type { PolicyVersion } from './types'

export const SAMPLE_BASE_EFFECTIVE = '2025-04-01'

const AMENDMENT_PAGES: ExtractedPage[] = [
  {
    page_number: 1,
    text:
      'ENDORSEMENT NO. 1 TO POLICY HDFHLIP21175V012021. SYNTHETIC DOCUMENT FOR DEMONSTRATION. ' +
      'This Endorsement is effective for all claims where date of admission is on or after 01 April 2026. ' +
      'All other terms of the policy remain unchanged.',
    char_count: 0,
  },
  {
    page_number: 2,
    text:
      'Clause 2.1 (Room Rent, replaced). Room rent is limited to Rs 5,000 per day. If the room rent exceeds this limit, all associated medical expenses such as nursing, ' +
      'doctor fees and operation theatre charges are reduced proportionately (proportionate deduction).',
    char_count: 0,
  },
  {
    page_number: 3,
    text:
      'Clause 5.3 (Senior Citizen Co-pay, replaced). A 25% co-payment applies to the admissible claim amount if the patient age is 60 or above on the date of admission.',
    char_count: 0,
  },
  {
    page_number: 4,
    text:
      'Clause 4.9 (Non-Payable Items, added). Gloves, masks, PPE kits, syringes, catheters, disposable kits and similar consumables and disposables are not payable.',
    char_count: 0,
  },
  {
    page_number: 5,
    text:
      'Clause 4.10 (Operative Items, added). Implants and operative consumables such as sutures and staplers used during the surgery are payable.',
    char_count: 0,
  },
]
for (const p of AMENDMENT_PAGES) p.char_count = p.text.length

function rule(id: string, p: Partial<PolicyRule> & Pick<PolicyRule, 'category' | 'rule_name' | 'value' | 'description' | 'status' | 'page_number' | 'evidence_text'>): PolicyRule {
  return {
    id,
    conditions: [],
    section_name: `Endorsement 1, page ${p.page_number}`,
    confidence: 'high',
    evidence_validated: true,
    ...p,
  }
}

const AMENDMENT_RULES: PolicyRule[] = [
  rule('amd1_room', {
    category: 'room_rent',
    rule_name: 'Room Rent Limit (Endorsement 1)',
    value: '₹5,000 per day',
    description: 'Room rent is limited to Rs 5,000 per day. Associated medical expenses are reduced proportionately when the room rent exceeds this limit (proportionate deduction).',
    status: 'conditionally_covered',
    page_number: 2,
    evidence_text: AMENDMENT_PAGES[1].text,
  }),
  rule('amd1_copay', {
    category: 'co_payment',
    rule_name: 'Senior Citizen Co-pay (Age 60+) revised',
    value: '25%',
    description: 'A 25% co-payment applies to the admissible claim amount if the patient age is 60 or above on the date of admission.',
    status: 'conditionally_covered',
    page_number: 3,
    evidence_text: AMENDMENT_PAGES[2].text,
  }),
  rule('amd1_excl', {
    category: 'exclusion',
    rule_name: 'Non-Payable Consumables and Disposables',
    value: 'Not covered',
    description: 'Gloves, masks, PPE kits, syringes, catheters, disposable kits and similar consumables and disposables are not payable.',
    status: 'not_covered',
    page_number: 4,
    evidence_text: AMENDMENT_PAGES[3].text,
  }),
  rule('amd1_cov', {
    category: 'coverage',
    rule_name: 'Operative Implants and Consumables Payable',
    value: 'Covered',
    description: 'Implants and operative consumables such as sutures and staplers used during the surgery are payable.',
    status: 'covered',
    page_number: 5,
    evidence_text: AMENDMENT_PAGES[4].text,
  }),
]

function amendmentResult(): PolicyAnalysisResult {
  const base = SAMPLE_POLICIES.hdfc_optima
  return {
    overview: { ...base.overview, plan_name: `${base.overview.plan_name} (Endorsement 1)` },
    rules: AMENDMENT_RULES,
    compiled_rules: compilePolicyRules(AMENDMENT_RULES, AMENDMENT_PAGES),
    pages: AMENDMENT_PAGES,
    total_pages: AMENDMENT_PAGES.length,
    scanned_pdf_warning: false,
    extraction_stats: { ...base.extraction_stats, total_rules: AMENDMENT_RULES.length },
    processing_time_ms: 0,
  }
}

/** Base policy plus Endorsement 1, as PolicyVersion objects. */
export function sampleVersions(): { base: PolicyVersion; amendment: PolicyVersion } {
  const base = makeVersion({
    id: 'base',
    label: 'Base policy',
    documentName: 'HDFC ERGO Optima Secure (sample).pdf',
    result: SAMPLE_POLICIES.hdfc_optima,
    kind: 'base',
    effectiveFrom: SAMPLE_BASE_EFFECTIVE,
    synthetic: true,
  })
  const amendment = makeVersion({
    id: 'endorsement-1',
    label: 'Endorsement 1',
    documentName: 'Endorsement 1 - Optima Secure (synthetic).pdf',
    result: amendmentResult(),
    kind: 'amendment',
    synthetic: true, // effective date is read from the document text by extractEffectiveDate
  })
  return { base, amendment }
}

// ─── bills ────────────────────────────────────────────────────────────────────

let n = 0
function line(description: string, category: HospitalBillLineItem['category'], amount: number, quantity = 1): HospitalBillLineItem {
  n += 1
  return {
    id: `item_${n}`,
    description,
    category,
    quantity,
    unitPrice: quantity > 1 ? Math.round(amount / quantity) : amount,
    amount,
    confidence: 'high',
  }
}

function makeBill(name: string, hospital: string, diagnosis: string, admissionDate: string, items: HospitalBillLineItem[]): HospitalBill {
  const sum = items.reduce((a, i) => a + i.amount, 0)
  return {
    hospitalName: hospital,
    billNumber: name,
    admissionDate,
    dischargeDate: admissionDate,
    diagnosis,
    totalBilledAmount: sum,
    calculatedLineSum: sum,
    lineToTotalDiscrepancy: 0,
    lineItems: items,
    warnings: ['Synthetic bill for demonstration.'],
    extractionMethod: 'ai',
    parsingConfidence: 'high',
  }
}

export interface SampleClaim {
  id: string
  title: string
  /** What this bill is built to show. */
  shows: string
  bill: HospitalBill
  patientAge: number
  policyStartDate: string
  /** Default treatment date. Change it to before 01 April 2026 to see the base policy apply. */
  treatmentDate: string
}

n = 0
const KNEE_ITEMS = [
  line('Single Deluxe AC Room (4 Days @ ₹8,000/day)', 'room', 32000, 4),
  line('Nursing and RMO Care Charges (4 Days)', 'room', 4800, 4),
  line('Major Operation Theatre Charges', 'surgery', 45000),
  line('Orthopaedic Surgeon Professional Fee', 'doctor', 60000),
  line('Anaesthetist Fee', 'doctor', 15000),
  line('Knee Prosthesis Implant (Attune CR)', 'implant', 120000),
  line('Pre-op and Post-op Diagnostics (Blood, ECG, X-Ray)', 'diagnostics', 14000),
  line('Inpatient Pharmacy and Antibiotic Injections', 'medicines', 26000),
  line('Gloves, Masks, PPE Kits and Syringes', 'consumables', 9500),
  line('Surgical Stapler and Suture Kit', 'consumables', 7200),
  line('Admission and Processing Fee', 'other', 2500),
  line('Patient Comfort Kit (Slippers, Toiletries)', 'other', 1800),
]

n = 100
const CATARACT_ITEMS = [
  line('Day-care Bed Charges (1 Day)', 'room', 1500),
  line('Phacoemulsification Cataract Surgery Procedure', 'surgery', 38000),
  line('Intraocular Lens (IOL) Implant for Cataract', 'implant', 22000),
  line('Ophthalmologist Surgeon Fee, Cataract Surgery', 'doctor', 8000),
  line('Antibiotic Eye Drops and Medicines', 'medicines', 1200),
  line('Registration Fee', 'other', 500),
]

export const SAMPLE_CLAIM_BILLS: SampleClaim[] = [
  {
    id: 'knee',
    title: 'Knee replacement, deluxe room',
    shows:
      'Version change (room cap and proportionate deduction, 25% co-pay, consumables exclusion), an excluded item, a conflicting item (stapler and suture kit) and charges with no clause.',
    bill: makeBill('SYN-KNEE-01', 'Synthetic Hospital A', 'Primary osteoarthritis right knee, total knee replacement', '2026-05-12', KNEE_ITEMS),
    patientAge: 64,
    policyStartDate: '2024-01-10',
    treatmentDate: '2026-05-12',
  },
  {
    id: 'cataract',
    title: 'Cataract surgery, day care',
    shows: 'A mostly supported claim: a cataract sub-limit applies, and the co-pay depends on the version in force.',
    bill: makeBill('SYN-CAT-01', 'Synthetic Eye Centre B', 'Cataract, right eye', '2026-05-20', CATARACT_ITEMS),
    patientAge: 62,
    policyStartDate: '2024-01-10',
    treatmentDate: '2026-05-20',
  },
]
