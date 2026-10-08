import { PolicyAnalysisResult, PolicyRule, CompiledRule } from './policy'

export interface PatientProfile {
  age: number
  policyStartDate?: string // YYYY-MM-DD
  continuityDate?: string
  proposedAdmissionDate?: string // YYYY-MM-DD
  declaredPED?: string[] // e.g. ['Diabetes', 'Hypertension', 'Arthritis', 'Cataract']
  availableSumInsured?: number // remaining SI after prior claims
  roomChoice: 'general' | 'twin-sharing' | 'single-private' | 'suite' | 'icu'
  isNetworkHospital?: boolean
}

export interface TreatmentScenario {
  treatment: string
  age: number
  city: string
  hospitalType: 'public' | 'private' | 'corporate'
  roomType: 'general' | 'twin-sharing' | 'single-private' | 'suite' | 'icu'
  stayDurationDays: number
  quotedCost?: number
  // Extended fields for ClaimLens (Blueprint F4)
  policyStartDate?: string
  proposedAdmissionDate?: string
  declaredPED?: string[]
  availableSumInsured?: number
  isNetworkHospital?: boolean
  quoteLineItems?: QuoteLineItem[]
}

export interface CostComponents {
  room: number
  surgery: number
  doctor: number
  medicines: number
  consumables: number
  diagnostics: number
  implants?: number
  ambulance?: number
  other?: number
}

export interface TreatmentCostData {
  id: string
  treatment: string
  categoryKey: string
  synonyms: string[]
  cityTier: 'Tier 1' | 'Tier 2' | 'Tier 3'
  hospitalType: string
  roomType: string
  minCost: number
  avgCost: number
  maxCost: number
  typicalStayDays: number
  typicalComponents: CostComponents
}

// ─── Quote Parser & Line Items (Blueprint Section 9) ───────────────────────

export interface QuoteLineItem {
  id: string
  category: 'room' | 'icu' | 'surgery' | 'doctor' | 'implant' | 'medicines' | 'diagnostics' | 'consumables' | 'ambulance' | 'other'
  description: string
  quantity: number
  unitPrice: number
  amount: number
  confidence: 'high' | 'medium' | 'low'
  sourcePage?: number
  coveredAmount?: number
  deductionExplanation?: string
  appliedRuleId?: string
}

export interface ParsedHospitalQuote {
  hospitalName?: string
  patientName?: string
  totalAmount: number
  calculatedSum: number
  discrepancy: number
  lineItems: QuoteLineItem[]
  sourceDocumentHash?: string
  rawText?: string
  warnings: string[]
}

// ─── Clause-to-Rupee Ledger (Blueprint Section 8 & 10) ──────────────────────

export interface DeductionLine {
  id: string
  ruleId?: string
  ruleName: string
  category: string
  ruleType: string
  originalAmount: number
  deductionAmount: number
  coveredAmountAfter: number
  evidence: {
    page: number | null
    section?: string
    quote: string
  }
  calculation: string // e.g. "20% co-pay on admissible ₹1,80,000" or "Room cap ₹5,000/day x 3 days"
  impact: 'deduction' | 'cap' | 'denial' | 'info' | 'eligible'
}

// ─── Missing Information Engine (Blueprint Section 10) ──────────────────────

export interface MissingField {
  id: string
  field: string
  label: string
  whyItMatters: string
  relatedRuleId?: string
  relatedClauseQuote?: string
  pageNumber?: number | null
  impact: 'blocks_estimate' | 'changes_copay' | 'changes_waiting_period' | 'changes_room_deduction' | 'high' | 'medium'
  suggestedInputType: 'date' | 'number' | 'select' | 'text'
  options?: string[]
  defaultValue?: any
}

// ─── What-if Simulator Result (Blueprint Section 10) ────────────────────────

export interface WhatIfDelta {
  field: string
  label: string
  oldValue: any
  newValue: any
  coveredDelta: number // e.g. +31400 or -50000
  patientShareDelta: number
  explanation: string
  affectedRuleName?: string
  clauseQuote?: string
  pageNumber?: number | null
}

export interface WhatIfResult {
  before: CoverageResult
  after: CoverageResult
  delta: WhatIfDelta
}

// ─── Policy Eligibility Timeline (Blueprint Section 11) ─────────────────────

export interface TimelineMilestone {
  id: string
  title: string
  durationText: string
  targetDate: string
  isCompleted: boolean
  isRelevantToTreatment: boolean
  ruleEvidence: {
    page: number | null
    quote: string
    ruleName: string
  }
  status: 'met' | 'active_wait' | 'pending_start_date'
  daysRemaining?: number
}

// ─── Pre-auth Claim Readiness (Blueprint Section 11) ────────────────────────

export interface ClaimReadinessItem {
  id: string
  title: string
  category: 'policy_fact' | 'clinical_document' | 'claim_form' | 'hospital_step'
  status: 'available' | 'missing' | 'recommended' | 'optional'
  evidenceText?: string
  pageNumber?: number | null
  description: string
}

// ─── Coverage & OOP Contract (Blueprint Section 8 & 11) ─────────────────────

export interface MoneyRange {
  min: number
  typical: number
  max: number
}

export interface CoverageResult {
  status: 'eligible' | 'conditional' | 'not_eligible' | 'cannot_determine'
  treatmentCost: MoneyRange
  potentiallyCovered: MoneyRange
  patientShare: MoneyRange
  costSource: 'hospital_quote' | 'manual_quote' | 'benchmark' | 'synthetic'
  ledger: DeductionLine[]
  missingInformation: MissingField[]
  assumptions: string[]
  evidenceCoverage: number // % of impactful rules with verified evidence (0-100)
  confidence: 'high' | 'medium' | 'low'
  costConfidence: 'high' | 'medium' | 'low'
  coverageConfidence: 'high' | 'medium' | 'low'
  waitingPeriodMet?: boolean
  waitingPeriodDetails?: {
    requiredMonths: number
    elapsedMonths?: number
    completionDate?: string
    ruleEvidence?: string
    pageNumber?: number | null
    isActive: boolean
  }
  lineItems?: QuoteLineItem[]
  readinessChecklist?: ClaimReadinessItem[]
  milestones?: TimelineMilestone[]
}

// Legacy structures maintained for backward compatibility
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
  // ClaimLens extended preflight result
  preflight?: CoverageResult
}
