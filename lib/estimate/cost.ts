import { TreatmentCostData, TreatmentScenario } from '../types/estimate'

export function estimateCost(
  scenario: TreatmentScenario,
  data: TreatmentCostData | null
): { min: number, avg: number, max: number } {
  if (scenario.quotedCost) {
    // If they have a quote, we trust it but still give a small range
    return {
      min: scenario.quotedCost * 0.9,
      avg: scenario.quotedCost,
      max: scenario.quotedCost * 1.1,
    }
  }

  if (data) {
    // We adjust slightly based on room type / stay
    let multiplier = 1.0
    if (scenario.roomType === 'suite') multiplier *= 1.3
    if (scenario.roomType === 'general') multiplier *= 0.8
    if (scenario.hospitalType === 'corporate') multiplier *= 1.2
    
    return {
      min: data.minCost * multiplier,
      avg: data.avgCost * multiplier,
      max: data.maxCost * multiplier,
    }
  }

  // Fallback rough estimate if completely unknown
  return { min: 50000, avg: 100000, max: 200000 }
}
