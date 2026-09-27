// ─── Core Types ─────────────────────────────────────────────────────────────

export type PolicyStatus =
  | 'covered'
  | 'conditionally_covered'
  | 'not_covered'
  | 'unclear'

export type PolicyCategory =
  | 'coverage'
  | 'exclusion'
  | 'waiting_period'
  | 'deductible'
  | 'co_payment'
  | 'room_rent'
  | 'icu_limit'
  | 'sub_limit'
  | 'eligibility'
  | 'claim_requirement'
  | 'sum_insured'
  | 'general'

export interface PolicyRule {
  id: string
  category: PolicyCategory
  rule_name: string
  value: string
  description: string
  status: PolicyStatus
  conditions: string[]
  page_number: number | null
  section_name: string
  evidence_text: string
  confidence: 'high' | 'medium' | 'low'
  evidence_validated: boolean
}

export interface PolicyOverview {
  insurer: string
  plan_name: string
  sum_insured: string
  policy_type: string
  total_pages: number
}

export interface ExtractedPage {
  page_number: number
  text: string
  char_count: number
}

export interface PolicyAnalysisResult {
  overview: PolicyOverview
  rules: PolicyRule[]
  pages: ExtractedPage[]
  total_pages: number
  scanned_pdf_warning: boolean
  extraction_stats: {
    total_rules: number
    coverage_count: number
    exclusion_count: number
    waiting_period_count: number
    limit_count: number
    eligibility_count: number
    claim_requirement_count: number
    high_confidence: number
    medium_confidence: number
    low_confidence: number
    validated_count: number
  }
  processing_time_ms: number
}

export interface AnalyzeRequest {
  file: File
}

export interface AnalyzeResponse {
  success: boolean
  data?: PolicyAnalysisResult
  error?: string
}
