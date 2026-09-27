import { TreatmentCostData, TreatmentScenario } from '../types/estimate'
import { MOCK_COST_DATASET, getCityTier } from './dataset'

export function matchTreatment(scenario: TreatmentScenario): TreatmentCostData | null {
  const tier = getCityTier(scenario.city)
  
  // Basic substring matching
  const match = MOCK_COST_DATASET.find(d => 
    d.treatment.toLowerCase().includes(scenario.treatment.toLowerCase()) &&
    d.cityTier === tier
  )
  
  if (match) return match
  
  // Fallback if exactly not matched but we have the treatment (ignoring tier)
  const partial = MOCK_COST_DATASET.find(d => 
    d.treatment.toLowerCase().includes(scenario.treatment.toLowerCase())
  )
  return partial || null
}
