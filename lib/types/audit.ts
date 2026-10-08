/**
 * ClaimLens — Phase 2 Audit Types
 *
 * Strict separation of two concern domains:
 *   - BILLING findings (arithmetic errors, duplicates, vague charges)
 *   - INSURANCE findings (coverage, exclusions, waiting periods, sub-limits)
 *
 * Nothing is labelled "fraud". A finding is a specific, verifiable observation
 * with supporting bill evidence, never a probability score.
 */

import type { BillLineCategory } from './bill'

// ─── Finding domain ──────────────────────────────────────────────────────────

export type FindingDomain = 'billing' | 'insurance'

// ─── Billing issue types ─────────────────────────────────────────────────────

export type BillingIssueType =
  | 'arithmetic_discrepancy'   // qty × unit ≠ line total
  | 'potential_duplicate'      // same/similar charge appears more than once
  | 'vague_charge'             // description is too generic (e.g. "Other Charges")
  | 'excessive_misc'           // Misc/Other as % of bill exceeds threshold
  | 'bill_total_mismatch'      // line-item sum ≠ stated gross total
  | 'low_confidence_extraction' // AI was unsure; user should verify

// ─── Insurance issue types ────────────────────────────────────────────────────

export type InsuranceIssueType =
  | 'excluded_category'        // item category is explicitly excluded
  | 'sub_limit_applies'        // specific sub-limit cap applies to this charge
  | 'room_rent_proportionate'  // room upgrade triggers proportionate deductions
  | 'waiting_period_risk'      // diagnosis may be subject to waiting period
  | 'consumables_not_covered'  // consumables/disposables excluded by policy
  | 'policy_not_loaded'        // no policy available; cannot assess

// ─── Single audit finding ─────────────────────────────────────────────────────

export interface AuditFinding {
  id: string
  domain: FindingDomain

  // Billing finding
  billingIssue?: BillingIssueType
  // Insurance finding
  insuranceIssue?: InsuranceIssueType

  severity: 'high' | 'medium' | 'info'

  // Affected line items (by id)
  affectedItemIds: string[]

  title: string
  explanation: string    // why this was flagged, in plain language

  // Verifiable evidence (never LLM-inferred amounts)
  billEvidence?: string  // verbatim description or raw text from the bill
  calculatedDiscrepancy?: number  // concrete arithmetic difference, if verifiable
  discrepancyFormula?: string     // e.g. "3 × ₹8,000 = ₹24,000 but billed ₹26,000"

  // Policy citation (insurance findings only)
  policyClause?: string   // verbatim policy excerpt
  policyPage?: number | null
  policySection?: string

  suggestedAction: string
  confidence: 'high' | 'medium' | 'low'
}

// ─── Per-item audit verdict ───────────────────────────────────────────────────

export type InsuranceVerdict =
  | 'likely_covered'
  | 'conditional'
  | 'likely_excluded'
  | 'sub_limit_applies'
  | 'unknown'
  | 'no_policy'

export type BillingVerdict =
  | 'ok'
  | 'verify'
  | 'discrepancy'

export interface AuditLineVerdict {
  itemId: string
  insuranceVerdict: InsuranceVerdict
  billingVerdict: BillingVerdict
  findingIds: string[]
  policyClause?: string
  policyPage?: number | null
}

// ─── Full audit result ────────────────────────────────────────────────────────

export interface BillAuditResult {
  // Summary
  totalBill: number
  lineItemSum: number
  billingFindingCount: number
  insuranceFindingCount: number

  // Per-item verdicts
  verdicts: AuditLineVerdict[]

  // All findings
  findings: AuditFinding[]

  // Metadata
  policyLoaded: boolean
  auditTimestamp: string
}
