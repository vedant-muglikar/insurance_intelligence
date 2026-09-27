import { ConfidenceMetrics, TreatmentScenario, PolicyEvaluation } from '../types/estimate'

export function calculateConfidence(
  scenario: TreatmentScenario,
  isExactMatch: boolean,
  hasQuote: boolean,
  policyEval: PolicyEvaluation
): ConfidenceMetrics {
  const reasons: string[] = []
  
  let costConf: 'high' | 'medium' | 'low' = 'low'
  if (hasQuote) {
    costConf = 'high'
    reasons.push('Cost confidence is high because a quoted amount was provided.')
  } else if (isExactMatch) {
    costConf = 'medium'
    reasons.push('Cost confidence is medium based on synthetic tier/hospital averages.')
  } else {
    reasons.push('Cost confidence is low because exact treatment cost data was not found.')
  }

  let covConf: 'high' | 'medium' | 'low' = 'medium'
  if (!policyEval.sumInsured) {
    covConf = 'low'
    reasons.push('Coverage confidence is low because total Sum Insured could not be extracted accurately.')
  } else {
    reasons.push('Coverage confidence is medium. Deductions are estimated based on typical policy structures.')
  }

  return { costConfidence: costConf, coverageConfidence: covConf, reasons }
}
