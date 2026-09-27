import { PolicyAnalysisResult, PolicyRule } from '../types/policy'
import { PolicyEvaluation, TreatmentScenario } from '../types/estimate'

export function evaluatePolicyRules(
  scenario: TreatmentScenario,
  policy: PolicyAnalysisResult
): PolicyEvaluation {
  const evalResult: PolicyEvaluation = {
    isCovered: true,
    isWaitPeriodActive: false,
    applicableSubLimit: null,
    applicableRoomLimit: null,
    deductible: 0,
    coPayPercentage: 0,
    sumInsured: null,
    reasons: []
  }

  // Parse global values (dumb simple parsing for demo)
  if (policy.overview.sum_insured) {
    const val = parseInt(policy.overview.sum_insured.replace(/[^0-9]/g, ''))
    if (!isNaN(val)) evalResult.sumInsured = val
  }

  policy.rules.forEach(rule => {
    // Exclusions
    if (rule.category === 'exclusion' && rule.status === 'not_covered') {
      if (rule.rule_name.toLowerCase().includes(scenario.treatment.toLowerCase())) {
        evalResult.isCovered = false
        evalResult.reasons.push(`Explicitly excluded: ${rule.rule_name}`)
      }
    }
    
    // Co-pay
    if (rule.category === 'co_payment') {
      const match = rule.value.match(/(\d+)%/)
      if (match) {
        evalResult.coPayPercentage = Math.max(evalResult.coPayPercentage, parseInt(match[1]))
        evalResult.reasons.push(`Co-pay of ${match[1]}% applies.`)
      }
    }

    // Deductible
    if (rule.category === 'deductible') {
      const match = rule.value.match(/(\d+)/)
      if (match) {
        evalResult.deductible = parseInt(match[1])
        evalResult.reasons.push(`Deductible of ₹${match[1]} applies.`)
      }
    }

    // Room rent
    if (rule.category === 'room_rent') {
      // E.g., "Single Private AC" or "1% of SI"
      // Simplistic check
      if (scenario.roomType === 'suite') {
        evalResult.reasons.push('Suite room might exceed limits, prorated deductions may apply.')
      }
    }
    
    // Sub limits
    if (rule.category === 'sub_limit') {
      if (rule.rule_name.toLowerCase().includes(scenario.treatment.toLowerCase())) {
        const val = parseInt(rule.value.replace(/[^0-9]/g, ''))
        if (!isNaN(val)) {
          evalResult.applicableSubLimit = val
          evalResult.reasons.push(`Sub-limit of ₹${val} applies to this treatment.`)
        }
      }
    }
  })

  return evalResult
}
