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
  usability?: 'executable' | 'explanatory_only' | 'needs_human_review'
  used_in_estimate?: boolean
}

// ─── Rule Compiler Types (Section 7) ─────────────────────────────────────────

export type CompiledRuleType =
  | 'WAITING_PERIOD'
  | 'COPAY'
  | 'DEDUCTIBLE'
  | 'SUB_LIMIT'
  | 'ROOM_LIMIT'
  | 'EXCLUSION'
  | 'ELIGIBILITY'
  | 'SUM_INSURED'
  | 'CLAIM_REQUIREMENT'
  | 'GENERAL_CLAUSE'

export interface RuleCondition {
  type: 'age' | 'waiting_elapsed' | 'ped' | 'room_category' | 'hospital_tier' | 'network' | 'custom'
  field?: string
  operator?: '>' | '>=' | '<' | '<=' | '==' | '!=' | 'in' | 'contains'
  value?: any
  description: string
}

export interface RuleEffect {
  action: 'cap' | 'deduct_fixed' | 'deduct_percentage' | 'deny' | 'require_info' | 'allow' | 'room_excess' | 'proration'
  amount?: number
  percentage?: number
  unit?: string
  capAmount?: number
  calculationBase?: 'bill_amount' | 'admissible_amount' | 'room_rent' | 'claim_amount'
  description?: string
}

export interface CompiledRule {
  id: string
  ruleType: CompiledRuleType
  rawCategory: PolicyCategory
  ruleName: string
  appliesTo: string[] // canonical treatment/category keys (e.g. ['cataract', 'joint_replacement', 'ped', 'maternity', 'all'])
  conditions: RuleCondition[]
  effect: RuleEffect
  calculationBase?: string
  precedence: number // lower number = applied earlier
  effectivePeriod?: {
    months?: number
    days?: number
    type?: 'initial' | 'specific_illness' | 'ped' | 'general'
  }
  evidence: {
    page: number | null
    section?: string
    quote: string
  }
  confidence: 'high' | 'medium' | 'low'
  verification: 'verified' | 'unverified'
  usability: 'executable' | 'explanatory_only' | 'needs_human_review'
  affectsEstimate?: boolean
}

// ─── Scalable Architecture: PlanTemplate vs UserPolicy (Section 13) ──────────

export interface PlanTemplate {
  planTemplateId: string
  insurer: string
  productName: string
  uinVersion?: string
  sourceDocumentHash?: string
  compiledRules: CompiledRule[]
  evidencePages: ExtractedPage[]
  templateConfidence: 'high' | 'medium' | 'low'
}

export interface UserPolicy {
  userPolicyId: string
  planTemplateId: string
  policyStartDate?: string
  continuityDate?: string
  policyEndDate?: string
  sumInsured: number
  remainingSumInsured?: number
  insuredMemberAge: number
  declaredPED: string[]
  selectedRiders?: string[]
}

export interface PolicyOverview {
  insurer: string
  plan_name: string
  sum_insured: string
  policy_type: string
  total_pages: number
  uin?: string
}

export interface ExtractedPage {
  page_number: number
  text: string
  char_count: number
  /** How the text was obtained. Absent for legacy/sample data (= 'text_layer'). */
  extraction_method?: PageExtractionMethod
  /** OCR diagnostics — present only when OCR ran on this page. */
  ocr?: PageOcrInfo
}

// ─── OCR / Hybrid Extraction Types ──────────────────────────────────────────

/**
 * text_layer — embedded PDF text was sufficient (existing pdf-parse path)
 * ocr        — page was scanned/garbled; OCR text replaced the text layer
 * hybrid     — text layer kept, plus OCR of embedded image content appended
 * failed     — neither method produced usable text
 */
export type PageExtractionMethod = 'text_layer' | 'ocr' | 'hybrid' | 'failed'

export type PageOcrQuality = 'good' | 'fair' | 'poor' | 'unreadable'

export interface OcrUncertainToken {
  text: string
  confidence: number
  /** Why the token was flagged */
  reason: 'low_confidence' | 'ambiguous_amount' | 'confusable_characters'
}

export interface PageOcrInfo {
  /** Mean word confidence 0–100 */
  confidence: number
  quality: PageOcrQuality
  word_count: number
  /** Degrees the page image was rotated to correct skew */
  deskew_angle: number
  /** Effective render resolution used for OCR */
  dpi: number
  /** Low-confidence words and ambiguous monetary values (capped) */
  uncertain_tokens: OcrUncertainToken[]
  /** Monetary values that could not be read reliably — never auto-corrected */
  ambiguous_amounts: string[]
  table_rows_detected: number
  duration_ms: number
  /** Human-readable warnings, e.g. "Page requires a clearer scan" */
  warnings: string[]
}

export interface PageExtractionSummary {
  page_number: number
  method: PageExtractionMethod
  /** Why this method was chosen, e.g. "Only 12 characters in text layer" */
  reason: string
  char_count: number
  image_coverage: number
  ocr_confidence?: number
  ocr_quality?: PageOcrQuality
  needs_clearer_scan: boolean
  warnings: string[]
  /** First ~300 chars of the final page text */
  preview: string
}

export interface ExtractionReport {
  total_pages: number
  text_layer_pages: number
  ocr_pages: number
  hybrid_pages: number
  failed_pages: number
  /** Pages the user should rescan */
  pages_needing_rescan: number[]
  /** Pages with OCR-uncertain monetary values */
  pages_with_ambiguous_amounts: number[]
  /** Pages that were not OCR'd because a limit or timeout was hit */
  skipped_pages: number[]
  average_ocr_confidence: number | null
  ocr_engine: string | null
  pages: PageExtractionSummary[]
  warnings: string[]
  duration_ms: number
}

/** Server → client progress events streamed as NDJSON from /api/policy/analyze?stream=1 */
export type AnalysisStage =
  | 'validating'
  | 'text_extraction'
  | 'page_detection'
  | 'ocr'
  | 'ai_analysis'
  | 'evidence_validation'
  | 'complete'

export type AnalysisProgressEvent =
  | { type: 'stage'; stage: AnalysisStage; message: string; progress: number }
  | {
      type: 'page'
      page_number: number
      total_pages: number
      method: PageExtractionMethod
      status: 'detected' | 'ocr_started' | 'ocr_done' | 'done'
      reason?: string
      ocr_confidence?: number
      ocr_quality?: PageOcrQuality
      needs_clearer_scan?: boolean
      warnings?: string[]
      preview?: string
    }
  | { type: 'result'; data: PolicyAnalysisResult }
  | { type: 'error'; error: string }

export interface PolicyAnalysisResult {
  overview: PolicyOverview
  rules: PolicyRule[]
  compiled_rules?: CompiledRule[]
  pages: ExtractedPage[]
  total_pages: number
  scanned_pdf_warning: boolean
  /** SHA-256 of the uploaded PDF — stable policy identity for saved checklists. Absent for samples. */
  document_hash?: string
  /** Per-page text-layer/OCR report. Absent for sample data and older results. */
  extraction_report?: ExtractionReport
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

// ─── Q&A Types ─────────────────────────────────────────────────────────────

export interface Citation {
  page_number: number
  section_name: string
  evidence_text: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  status?: PolicyStatus
  citations?: Citation[]
  confidence?: 'high' | 'medium' | 'low'
  timestamp: string
}

export interface AskResponseData {
  answer: string
  status: PolicyStatus
  citations: Citation[]
  confidence: 'high' | 'medium' | 'low'
}

export interface AskRequest {
  question: string
  pages: ExtractedPage[]
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  scenarioContext?: string
}

export interface AskResponse {
  success: boolean
  data?: AskResponseData
  error?: string
}

// ─── Claim Dispute Types ────────────────────────────────────────────────────

export interface DisputeArgument {
  rejection_reason: string
  counter_argument: string
  supporting_clauses: Citation[]
  strength: 'strong' | 'moderate' | 'weak'
  legal_basis?: string
}

export interface DisputeAnalysis {
  verdict: 'disputable' | 'partially_disputable' | 'not_disputable'
  verdict_summary: string
  arguments: DisputeArgument[]
  recommended_actions: string[]
  overall_confidence: 'high' | 'medium' | 'low'
  disclaimer: string
}

export interface DisputeRequest {
  rejection_reasons: string[]
  treatment_name?: string
  claim_amount?: string
  rejection_letter_text?: string
  pages: ExtractedPage[]
}

export interface DisputeResponse {
  success: boolean
  data?: DisputeAnalysis
  error?: string
}

