import { TreatmentCostData } from '../types/estimate'

export const MOCK_COST_DATASET: TreatmentCostData[] = [
  {
    id: 't1',
    treatment: 'Appendectomy',
    cityTier: 'Tier 1',
    hospitalType: 'private',
    roomType: 'single-private',
    minCost: 80000,
    avgCost: 120000,
    maxCost: 160000,
    typicalComponents: {
      room: 15000,
      surgery: 60000,
      doctor: 20000,
      medicines: 10000,
      consumables: 5000,
      diagnostics: 10000,
    },
  },
  {
    id: 't2',
    treatment: 'Knee Replacement',
    cityTier: 'Tier 1',
    hospitalType: 'corporate',
    roomType: 'single-private',
    minCost: 250000,
    avgCost: 320000,
    maxCost: 400000,
    typicalComponents: {
      room: 40000,
      surgery: 150000,
      doctor: 50000,
      medicines: 30000,
      consumables: 30000,
      diagnostics: 20000,
    },
  },
  {
    id: 't3',
    treatment: 'Cataract Surgery',
    cityTier: 'Tier 1',
    hospitalType: 'private',
    roomType: 'general',
    minCost: 30000,
    avgCost: 45000,
    maxCost: 60000,
    typicalComponents: {
      room: 5000,
      surgery: 25000,
      doctor: 5000,
      medicines: 5000,
      consumables: 3000,
      diagnostics: 2000,
    },
  },
  {
    id: 't4',
    treatment: 'Maternity',
    cityTier: 'Tier 1',
    hospitalType: 'private',
    roomType: 'twin-sharing',
    minCost: 60000,
    avgCost: 90000,
    maxCost: 120000,
    typicalComponents: {
      room: 20000,
      surgery: 40000,
      doctor: 15000,
      medicines: 5000,
      consumables: 5000,
      diagnostics: 5000,
    },
  }
]

// Simple city to tier mapping
export function getCityTier(city: string): 'Tier 1' | 'Tier 2' | 'Tier 3' {
  const tier1 = ['mumbai', 'delhi', 'bangalore', 'chennai', 'hyderabad', 'kolkata', 'pune']
  if (tier1.includes(city.toLowerCase())) return 'Tier 1'
  return 'Tier 2'
}
