import { PolicyEvaluation, CoverageCalculation } from '../types/estimate'

export function calculateCoverage(
  costRange: { min: number, avg: number, max: number },
  policyEval: PolicyEvaluation
): CoverageCalculation {
  if (!policyEval.isCovered) {
    return {
      estimatedCostRange: [costRange.min, costRange.max],
      typicalCost: costRange.avg,
      estimatedCoverageRange: [0, 0],
      estimatedOutOfPocketRange: [costRange.min, costRange.max],
      breakdown: { roomRentDeduction: 0, subLimitDeduction: 0, coPayDeduction: 0, deductibleDeduction: 0 }
    }
  }

  const breakdown = { roomRentDeduction: 0, subLimitDeduction: 0, coPayDeduction: 0, deductibleDeduction: 0 }
  
  let typicalCov = costRange.avg
  let minCov = costRange.min
  let maxCov = costRange.max

  // Deductible
  if (policyEval.deductible > 0) {
    breakdown.deductibleDeduction = policyEval.deductible
    typicalCov = Math.max(0, typicalCov - policyEval.deductible)
    minCov = Math.max(0, minCov - policyEval.deductible)
    maxCov = Math.max(0, maxCov - policyEval.deductible)
  }

  // Sub limits
  if (policyEval.applicableSubLimit && typicalCov > policyEval.applicableSubLimit) {
    breakdown.subLimitDeduction = typicalCov - policyEval.applicableSubLimit
    typicalCov = policyEval.applicableSubLimit
    if (maxCov > policyEval.applicableSubLimit) maxCov = policyEval.applicableSubLimit
    if (minCov > policyEval.applicableSubLimit) minCov = policyEval.applicableSubLimit
  }

  // Co-pay
  if (policyEval.coPayPercentage > 0) {
    const p = policyEval.coPayPercentage / 100
    breakdown.coPayDeduction = typicalCov * p
    typicalCov -= (typicalCov * p)
    minCov -= (minCov * p)
    maxCov -= (maxCov * p)
  }

  const oopMin = costRange.min - minCov
  const oopMax = costRange.max - maxCov

  return {
    estimatedCostRange: [costRange.min, costRange.max],
    typicalCost: costRange.avg,
    estimatedCoverageRange: [minCov, maxCov],
    estimatedOutOfPocketRange: [Math.max(0, oopMin), Math.max(0, oopMax)],
    breakdown
  }
}
