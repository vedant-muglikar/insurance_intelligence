import { TreatmentScenario, EstimateResult } from '../types/estimate'
import { PolicyAnalysisResult } from '../types/policy'
import { validateScenario } from './validation'
import { matchTreatment } from './matching'
import { estimateCost } from './cost'
import { evaluatePolicyRules } from './policy'
import { calculateCoverage } from './coverage'
import { calculateConfidence } from './confidence'

export function generateEstimate(
  scenario: TreatmentScenario,
  policyResult: PolicyAnalysisResult
): { result?: EstimateResult, errors?: string[] } {
  
  const errors = validateScenario(scenario)
  if (errors.length > 0) return { errors }

  const matchedData = matchTreatment(scenario)
  const isExactMatch = matchedData !== null && matchedData.treatment.toLowerCase() === scenario.treatment.toLowerCase()

  const costRange = estimateCost(scenario, matchedData)
  const policyEval = evaluatePolicyRules(scenario, policyResult)
  const coverage = calculateCoverage(costRange, policyEval)
  const confidence = calculateConfidence(scenario, isExactMatch, !!scenario.quotedCost, policyEval)

  const result: EstimateResult = {
    scenario,
    policyEval,
    coverage,
    confidence
  }

  return { result }
}
