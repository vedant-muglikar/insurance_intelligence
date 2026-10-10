/**
 * Claim adjudication types: policy document versions, version selection, and the item-level ledger.
 * Everything here is plain data. The arithmetic lives in adjudicate.ts and never touches a model.
 */

import type { CompiledRule, ExtractedPage, PolicyRule } from '@/lib/types/policy'
import type { BillLineCategory } from '@/lib/types/bill'

// ─── Policy versions ──────────────────────────────────────────────────────────

export interface PolicyVersion {
  id: string
  /** "Base policy", "Endorsement 1" */
  label: string
  kind: 'base' | 'amendment'
  documentName: string
  uin?: string | null
  /** ISO date (yyyy-mm-dd) from which this document applies to a treatment. Null when the document does not say. */
  effectiveFrom: string | null
  effectiveFromEvidence?: { page: number | null; quote: string }
  /** ISO date after which it no longer applies, if the document says so. */
  effectiveTo?: string | null
  rules: PolicyRule[]
  compiled: CompiledRule[]
  pages: ExtractedPage[]
  /** Synthetic documents used for demonstration are labelled so they are never mistaken for real wording. */
  synthetic?: boolean
}

export interface MergedRule {
  rule: CompiledRule
  versionId: string
  versionLabel: string
  origin: 'base' | 'amendment'
  /** Rule name, value and description as written, used for matching bill items to the clause. */
  text: string
  /** Set when this rule replaced a rule from an earlier document. */
  supersedes?: { versionId: string; ruleId: string; ruleName: string }
}

export interface VersionChange {
  kind: 'replaced' | 'added'
  amendmentId: string
  amendmentLabel: string
  ruleName: string
  ruleType: string
  /** Rule it replaced, for kind "replaced". */
  previousName?: string
  previousSummary?: string
  newSummary: string
}

export interface VersionCandidate {
  id: string
  label: string
  kind: 'base' | 'amendment'
  effectiveFrom: string | null
  inForce: boolean
  reason: string
}

export interface VersionSelection {
  treatmentDate: string | null
  candidates: VersionCandidate[]
  /** Ids applied, in precedence order: base first, then amendments by effective date. */
  inForce: string[]
  rules: MergedRule[]
  changes: VersionChange[]
  warnings: string[]
}

// ─── Clause matching ──────────────────────────────────────────────────────────

export type ClauseRole = 'exclusion' | 'limit' | 'room' | 'coverage' | 'waiting' | 'other'

export interface ClauseMatch {
  rule: CompiledRule
  versionId: string
  versionLabel: string
  role: ClauseRole
  /** Higher is stronger. Comparable only within one matcher. */
  score: number
  matchedTerms: string[]
  method: string
  /** Set by matchers that check the clause's own words (the semantic matcher). Keyword matches have none. */
  verification?: ClauseVerification
}

/** Whether the clause's own words support the reading the match implies. */
export interface ClauseVerification {
  /** supported: the clause says it. conditional: the clause carves out or conditions it and the item touches that part. unsupported: no passage backs it. */
  status: 'supported' | 'conditional' | 'unsupported'
  /** The words of the clause that carry the match, copied from the clause text. */
  span: string
  similarity: number
  /** How far the clause stands out from the item's scores against every other clause, in standard deviations. */
  peak?: number
  /** The exception or condition part of the clause, when it has one. */
  condition?: string
  conditionSimilarity?: number
  /** quote: the span comes from the verbatim evidence quote. description: from the extracted description. */
  evidenceSource: 'quote' | 'description'
  reason: string
}

export interface ClauseMatcher {
  name: string
  method?: string
  /** How much stronger one match must be to beat a match of the opposite kind. Default 2 (shared words). */
  conflictMargin?: number
  match(args: {
    text: string
    category?: BillLineCategory
    rules: MergedRule[]
  }): ClauseMatch[]
}

// ─── Ledger ───────────────────────────────────────────────────────────────────

export type DeductionStage =
  | 'waiting_period'
  | 'exclusion'
  | 'room_rent'
  | 'sub_limit'
  | 'deductible'
  | 'copay'
  | 'sum_insured'
  | 'review_hold'

export interface ClauseRef {
  ruleId: string
  ruleName: string
  versionId: string
  versionLabel: string
  page: number | null
  section?: string
  quote: string
}

export interface LedgerDeduction {
  stage: DeductionStage
  amount: number
  formula: string
  clauses: ClauseRef[]
}

export type ItemStatus = 'payable' | 'reduced' | 'excluded' | 'review'

export interface LedgerItem {
  id: string
  description: string
  category: BillLineCategory
  claimed: number
  payable: number
  deductions: LedgerDeduction[]
  status: ItemStatus
  /** What needs a human look, in plain words. */
  review: string[]
  /** Clauses the matcher linked to this item, strongest first, for transparency. */
  matches: Array<{ ruleName: string; versionLabel: string; role: ClauseRole; score: number; terms: string[] }>
  /** Amount held back only because evidence conflicts or is missing; not counted as a confirmed deduction. */
  heldForReview: number
}

export interface TraceStep {
  stage: DeductionStage | 'version' | 'start' | 'result'
  title: string
  formula: string
  clause?: ClauseRef
  totalBefore: number
  deducted: number
  totalAfter: number
  perItem?: Array<{ itemId: string; description: string; amount: number }>
}

export interface LedgerChecks {
  ok: boolean
  messages: string[]
}

export interface AdjudicationResult {
  treatmentDate: string | null
  selection: VersionSelection
  items: LedgerItem[]
  totals: {
    claimed: number
    payable: number
    /** claimed - payable, including amounts held for review. */
    patientPays: number
    /** The part of patientPays that is held only because evidence is missing or conflicting. */
    heldForReview: number
    byStage: Partial<Record<DeductionStage, number>>
  }
  trace: TraceStep[]
  /** Bill-level notes: missing inputs, conditional clauses that could not be evaluated. */
  warnings: string[]
  checks: LedgerChecks
  matcher: string
}
