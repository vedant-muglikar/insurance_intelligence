import { PolicyAnalysisResult, PolicyRule } from './policy'

export interface TreatmentScenario {
  treatment: string
  age: number
  city: string
  hospitalType: 'public' | 'private' | 'corporate'
  roomType: 'general' | 'twin-sharing' | 'single-private' | 'suite' | 'icu'
  stayDurationDays: number
  quotedCost?: number
}

export interface CostComponents {
  room: number
  surgery: number
  doctor: number
  medicines: number
  consumables: number
  diagnostics: number
}

export interface TreatmentCostData {
  id: string
  treatment: string
  cityTier: 'Tier 1' | 'Tier 2' | 'Tier 3'
  hospitalType: string
  roomType: string
  minCost: number
  avgCost: number
  maxCost: number
  typicalComponents: CostComponents
}

export interface PolicyEvaluation {
  isCovered: boolean
  isWaitPeriodActive: boolean
  applicableSubLimit: number | null
  applicableRoomLimit: number | null
  deductible: number
  coPayPercentage: number
  sumInsured: number | null
  reasons: string[]
}

export interface CoverageCalculation {
  estimatedCostRange: [number, number]
  typicalCost: number
  estimatedCoverageRange: [number, number]
  estimatedOutOfPocketRange: [number, number]
  breakdown: {
    roomRentDeduction: number
    subLimitDeduction: number
    coPayDeduction: number
    deductibleDeduction: number
  }
}

export interface ConfidenceMetrics {
  costConfidence: 'high' | 'medium' | 'low'
  coverageConfidence: 'high' | 'medium' | 'low'
  reasons: string[]
}

export interface EstimateResult {
  scenario: TreatmentScenario
  policyEval: PolicyEvaluation
  coverage: CoverageCalculation
  confidence: ConfidenceMetrics
}
