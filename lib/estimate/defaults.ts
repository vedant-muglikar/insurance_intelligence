import { demoScenario, isDemoPolicy } from '@/lib/demo/preset'
import type { TreatmentScenario } from '@/lib/types/estimate'
import type { PolicyAnalysisResult } from '@/lib/types/policy'

/** The stay the Estimator opens with, also priced by the Hospitals tab before the Estimator has been opened */
export function defaultScenario(policy: PolicyAnalysisResult): TreatmentScenario {
  if (isDemoPolicy(policy)) return demoScenario(policy)
  return {
    treatment: 'Total Knee Replacement',
    age: 58,
    city: 'Mumbai',
    hospitalType: 'private',
    roomType: 'single-private',
    stayDurationDays: 4,
    policyStartDate: '2023-01-15',
    proposedAdmissionDate: new Date().toISOString().split('T')[0],
    declaredPED: [],
    // Taken from the policy document; left empty (the form asks) when the PDF does not state one clearly.
    availableSumInsured: policy.overview.sum_insured_amount ?? undefined,
    isNetworkHospital: true,
  }
}
