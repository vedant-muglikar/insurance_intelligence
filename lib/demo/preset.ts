/**
 * Demo preset for the Suraksha Comprehensive sample policy. When that policy is loaded, the Estimator and the
 * Claim Ledger open with the same patient and the same hospital bill, so both show the same numbers with no typing.
 *
 * Patient and dates are taken from the policy schedule (Ramesh Shankar Kulkarni, born 14-Mar-1964, first inception
 * 12-Jan-2023, current policy year from 12-Jan-2026). The bill is the knee-replacement sample (lib/claims/samples.ts),
 * also available as Sample_Hospital_Bill_Knee_Replacement.pdf.
 */

import { SAMPLE_CLAIM_BILLS } from '@/lib/claims/samples'
import type { QuoteLineItem, TreatmentScenario } from '@/lib/types/estimate'
import type { PolicyAnalysisResult } from '@/lib/types/policy'

export const DEMO_POLICY_UIN = 'SUHLIP23045V012223'

const KNEE = SAMPLE_CLAIM_BILLS.find((c) => c.id === 'knee')!

export const DEMO_CASE = {
  billId: KNEE.id,
  treatment: 'Total Knee Replacement',
  admissionDate: KNEE.treatmentDate, // 12-May-2026
  stayDurationDays: 4,
  patientAge: 62,
  policyStartDate: '2023-01-12',
  policyEffectiveFrom: '2026-01-12',
  availableSumInsured: 500000,
  city: 'Pune',
} as const

export function isDemoPolicy(policy: PolicyAnalysisResult): boolean {
  return policy.overview.uin === DEMO_POLICY_UIN || /suraksha comprehensive/i.test(policy.overview.plan_name ?? '')
}

/** The Estimator's opening scenario for the demo policy: the same stay, with the sample bill loaded as the hospital quote */
export function demoScenario(policy: PolicyAnalysisResult): TreatmentScenario {
  const quoteLineItems: QuoteLineItem[] = KNEE.bill.lineItems.map((i) => ({
    id: i.id,
    category: i.category,
    description: i.description,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    amount: i.amount,
    confidence: 'high',
  }))
  return {
    treatment: DEMO_CASE.treatment,
    age: DEMO_CASE.patientAge,
    city: DEMO_CASE.city,
    hospitalType: 'private',
    roomType: 'suite',
    stayDurationDays: DEMO_CASE.stayDurationDays,
    policyStartDate: DEMO_CASE.policyStartDate,
    proposedAdmissionDate: DEMO_CASE.admissionDate,
    declaredPED: [],
    availableSumInsured: policy.overview.sum_insured_amount ?? DEMO_CASE.availableSumInsured,
    isNetworkHospital: true,
    quoteLineItems,
    quotedCost: quoteLineItems.reduce((a, i) => a + i.amount, 0),
  }
}
