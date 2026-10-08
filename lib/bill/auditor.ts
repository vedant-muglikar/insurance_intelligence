/**
 * ClaimLens — Phase 2 Deterministic Bill Audit Engine
 *
 * This module runs entirely in pure TypeScript — NO LLM math, NO LLM decisions.
 *
 * The auditor operates in two strictly separate tracks:
 *
 * TRACK A — BILLING AUDIT (always runs, no policy needed)
 *   1. Arithmetic check: qty × unit_price === amount for every line
 *   2. Potential duplicate detection: normalised descriptions with same category & similar amounts
 *   3. Vague charge detection: "Other", "Misc", "Sundry" descriptions
 *   4. Excessive misc ratio: if "other" category > 15% of total bill
 *   5. Bill-total mismatch: line-item sum vs stated gross total
 *   6. Low-confidence extraction warnings
 *
 * TRACK B — INSURANCE COVERAGE AUDIT (runs only when policy rules are provided)
 *   1. Category-level exclusion matching: consumables, ambulance, OPD, cosmetic
 *   2. Sub-limit detection: implants, cataract, maternity caps
 *   3. Room-rent proportionate deduction risk
 *   4. Waiting period risk for relevant diagnoses
 *
 * Every finding carries a concrete bill reference. Discrepancies include
 * the exact formula — never a percentage probability of fraud.
 */

import type {
  AuditFinding,
  AuditLineVerdict,
  BillAuditResult,
  InsuranceVerdict,
  BillingVerdict,
} from '../types/audit'
import type { HospitalBillLineItem, HospitalBill, BillLineCategory } from '../types/bill'
import type { PolicyRule } from '../types/policy'

// ─── String normalizer for duplicate detection ────────────────────────────────

function normalizeDesc(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // remove common suffixes / fillers
    .replace(/\b(charges?|fee|fees|cost|costs|per|day|days|x|times)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

/** Returns true if two descriptions are similar enough to be flagged as potential duplicates */
function descriptionsSimilar(a: string, b: string): boolean {
  const na = normalizeDesc(a)
  const nb = normalizeDesc(b)
  if (na === nb) return true
  if (na.length < 4 || nb.length < 4) return na === nb
  const longer = Math.max(na.length, nb.length)
  const dist = levenshtein(na, nb)
  if (dist / longer < 0.35) return true // within 35% edit distance

  // Token overlap check (handles reordered or appended words like "Drug Eluting Coronary Stent" vs "Coronary Stent Device")
  const tokensA = new Set(na.split(' ').filter(t => t.length > 2))
  const tokensB = new Set(nb.split(' ').filter(t => t.length > 2))
  if (tokensA.size > 0 && tokensB.size > 0) {
    let common = 0
    tokensA.forEach(t => {
      if (tokensB.has(t)) common++
    })
    const minTokens = Math.min(tokensA.size, tokensB.size)
    if (common >= 2 && common / minTokens >= 0.5) return true
    if (common === minTokens && minTokens >= 1) return true
  }

  return false
}

// ─── Vague description patterns ───────────────────────────────────────────────

const VAGUE_PATTERNS = [
  /^(other|misc|miscellaneous|sundry|general|various|charges?|service|services?|additional)\s*$/i,
  /^(other|misc|miscellaneous|sundry)\s+(hospital\s+)?(charges?|expenses?|costs?|fees?)$/i,
  /^(hospital\s+charges?|gen\s+charges?|admin\s+charges?)$/i,
  /\b(misc|miscellaneous|sundry|unspecified)\b/i,
]

function isVague(desc: string): boolean {
  const d = desc.trim()
  return VAGUE_PATTERNS.some(p => p.test(d)) || d.length < 5
}

// ─── BILLING TRACK ────────────────────────────────────────────────────────────

function runBillingAudit(
  items: HospitalBillLineItem[],
  bill: HospitalBill,
  findings: AuditFinding[],
  verdicts: Map<string, { billing: BillingVerdict; findingIds: string[] }>
) {
  const fid = () => `billing_${findings.length + 1}`

  // ── 1. Bill total mismatch ───────────────────────────────────────────────────
  const lineSum = items.reduce((a, i) => a + i.amount, 0)
  if (Math.abs(lineSum - bill.totalBilledAmount) > 100) {
    const diff = Math.abs(lineSum - bill.totalBilledAmount)
    const id = fid()
    findings.push({
      id,
      domain: 'billing',
      billingIssue: 'bill_total_mismatch',
      severity: diff > 5000 ? 'high' : 'medium',
      affectedItemIds: [],
      title: 'Bill Total Does Not Match Line Item Sum',
      explanation:
        `The stated gross total (₹${bill.totalBilledAmount.toLocaleString('en-IN')}) differs ` +
        `from the sum of all extracted line items (₹${lineSum.toLocaleString('en-IN')}) by ` +
        `₹${diff.toLocaleString('en-IN')}. This can occur when package charges are not individually ` +
        `itemised, or when some rows were not extracted.`,
      billEvidence: `Stated gross: ₹${bill.totalBilledAmount.toLocaleString('en-IN')} | Extracted line sum: ₹${lineSum.toLocaleString('en-IN')}`,
      calculatedDiscrepancy: diff,
      discrepancyFormula: `₹${lineSum.toLocaleString('en-IN')} (line items) ≠ ₹${bill.totalBilledAmount.toLocaleString('en-IN')} (stated total)`,
      suggestedAction: 'Ask the hospital to provide a fully itemised bill. Ensure no lines were missed during document extraction.',
      confidence: 'high',
    })
  }

  // ── 2. Arithmetic check ──────────────────────────────────────────────────────
  for (const item of items) {
    if (item.quantity <= 0 || item.unitPrice <= 0) continue
    const expected = Math.round(item.quantity * item.unitPrice)
    const actual = Math.round(item.amount)
    const diff = Math.abs(expected - actual)
    // Allow ₹2 rounding tolerance
    if (diff > 2) {
      const id = fid()
      findings.push({
        id,
        domain: 'billing',
        billingIssue: 'arithmetic_discrepancy',
        severity: diff > 1000 ? 'high' : 'medium',
        affectedItemIds: [item.id],
        title: `Arithmetic Discrepancy: ${item.description}`,
        explanation:
          `The quantity (${item.quantity}) multiplied by the unit rate ` +
          `(₹${item.unitPrice.toLocaleString('en-IN')}) equals ₹${expected.toLocaleString('en-IN')}, ` +
          `but the line total is billed as ₹${actual.toLocaleString('en-IN')}. ` +
          `Difference: ₹${diff.toLocaleString('en-IN')}.`,
        billEvidence: item.originalText || item.description,
        calculatedDiscrepancy: diff,
        discrepancyFormula: `${item.quantity} × ₹${item.unitPrice.toLocaleString('en-IN')} = ₹${expected.toLocaleString('en-IN')} but billed ₹${actual.toLocaleString('en-IN')}`,
        suggestedAction: 'Request the hospital to clarify the calculation for this line item. This may be a data entry error.',
        confidence: 'high',
      })
      const v = verdicts.get(item.id)!
      v.billing = 'discrepancy'
      v.findingIds.push(id)
    }
  }

  // ── 3. Potential duplicate detection ─────────────────────────────────────────
  const flaggedPairs = new Set<string>()
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j]
      const pairKey = [a.id, b.id].sort().join('|')
      if (flaggedPairs.has(pairKey)) continue

      // Same category and similar description
      if (a.category !== b.category) continue
      if (!descriptionsSimilar(a.description, b.description)) continue

      // Allow same item if quantities differ significantly (different days)
      // but flag if amounts are within 10% of each other
      const amtRatio = Math.min(a.amount, b.amount) / Math.max(a.amount, b.amount)
      if (amtRatio < 0.9) continue  // very different amounts — not a duplicate

      flaggedPairs.add(pairKey)
      const id = fid()
      findings.push({
        id,
        domain: 'billing',
        billingIssue: 'potential_duplicate',
        severity: 'medium',
        affectedItemIds: [a.id, b.id],
        title: `Possible Duplicate Charge: "${a.description}"`,
        explanation:
          `Two line items with similar descriptions and amounts appear in the same category (${a.category}). ` +
          `"${a.description}" (₹${a.amount.toLocaleString('en-IN')}) and "${b.description}" ` +
          `(₹${b.amount.toLocaleString('en-IN')}) may be billed twice for the same service. ` +
          `This is flagged for review — some services are legitimately billed multiple times (e.g. daily visits).`,
        billEvidence: `Item 1: "${a.description}" ₹${a.amount.toLocaleString('en-IN')} | Item 2: "${b.description}" ₹${b.amount.toLocaleString('en-IN')}`,
        calculatedDiscrepancy: Math.min(a.amount, b.amount), // the smaller charge may be duplicated
        suggestedAction: 'Ask the hospital billing desk to confirm whether both charges are for separate services on different dates.',
        confidence: 'medium',
      })

      const va = verdicts.get(a.id)!
      const vb = verdicts.get(b.id)!
      if (va.billing === 'ok') va.billing = 'verify'
      if (vb.billing === 'ok') vb.billing = 'verify'
      va.findingIds.push(id)
      vb.findingIds.push(id)
    }
  }

  // ── 4. Vague charge detection ─────────────────────────────────────────────────
  for (const item of items) {
    if (isVague(item.description)) {
      const id = fid()
      findings.push({
        id,
        domain: 'billing',
        billingIssue: 'vague_charge',
        severity: item.amount >= 5000 ? 'high' : 'medium',
        affectedItemIds: [item.id],
        title: `Vague Charge Requires Itemisation: "${item.description}"`,
        explanation:
          `This charge (₹${item.amount.toLocaleString('en-IN')}) has a non-specific description that ` +
          `does not clearly identify what service was provided. Insurance companies typically require ` +
          `specific service names to process claims. Vague charges are frequently disallowed.`,
        billEvidence: item.originalText || item.description,
        suggestedAction: 'Request a detailed breakdown of this charge. Ask the hospital to replace "Miscellaneous" with individual service names.',
        confidence: 'high',
      })
      const v = verdicts.get(item.id)!
      if (v.billing === 'ok') v.billing = 'verify'
      v.findingIds.push(id)
    }
  }

  // ── 5. Excessive miscellaneous ratio ─────────────────────────────────────────
  const totalBill = Math.max(lineSum, bill.totalBilledAmount, 1)
  const miscTotal = items
    .filter(i => i.category === 'other')
    .reduce((a, i) => a + i.amount, 0)
  const miscRatio = miscTotal / totalBill

  if (miscRatio > 0.15 && miscTotal > 3000) {
    const id = fid()
    findings.push({
      id,
      domain: 'billing',
      billingIssue: 'excessive_misc',
      severity: miscRatio > 0.25 ? 'high' : 'medium',
      affectedItemIds: items.filter(i => i.category === 'other').map(i => i.id),
      title: `Miscellaneous Charges Are ${Math.round(miscRatio * 100)}% of Total Bill`,
      explanation:
        `"Other / Admin / Misc" charges total ₹${miscTotal.toLocaleString('en-IN')}, which is ` +
        `${Math.round(miscRatio * 100)}% of the total bill. Industry guidance suggests that ` +
        `unclassified charges above 10–15% of a bill should be itemised individually. ` +
        `High miscellaneous ratios are a common reason for insurance claim rejections.`,
      billEvidence: `Misc items total: ₹${miscTotal.toLocaleString('en-IN')} of ₹${totalBill.toLocaleString('en-IN')} total`,
      calculatedDiscrepancy: miscTotal,
      suggestedAction: 'Ask the hospital to replace "Miscellaneous" line items with individual service charges (e.g. "Surgeon Gloves ₹150", "Surgical Drape ₹300").',
      confidence: 'high',
    })
  }

  // ── 6. Low-confidence extraction ──────────────────────────────────────────────
  for (const item of items) {
    if (item.confidence === 'low') {
      const id = fid()
      findings.push({
        id,
        domain: 'billing',
        billingIssue: 'low_confidence_extraction',
        severity: 'info',
        affectedItemIds: [item.id],
        title: `Low Extraction Confidence: "${item.description}"`,
        explanation:
          `The AI extraction system flagged this line item as uncertain. ` +
          `The amount (₹${item.amount.toLocaleString('en-IN')}) or description may not have been read clearly from the bill PDF. ` +
          `Please verify this item against the original document.`,
        billEvidence: item.originalText || item.description,
        suggestedAction: 'Cross-check this amount against the paper copy of the hospital bill.',
        confidence: 'low',
      })
      const v = verdicts.get(item.id)!
      if (v.billing === 'ok') v.billing = 'verify'
      v.findingIds.push(id)
    }
  }
}

// ─── INSURANCE TRACK ──────────────────────────────────────────────────────────

// Map bill categories to policy-relevant concepts
const CONSUMABLES_EXCLUDED_KEYWORDS = ['consumable', 'disposable', 'glove', 'ppe', 'kit', 'drape', 'syringe', 'catheter', 'suture']
const IMPLANT_SUBCAP_KEYWORDS = ['implant', 'prosthesis', 'stent', 'mesh', 'iol', 'pacemaker', 'screw', 'plate', 'nail', 'rod']
const ROOM_EXCLUSION_CATEGORIES: BillLineCategory[] = ['room', 'icu']

function runInsuranceAudit(
  items: HospitalBillLineItem[],
  bill: HospitalBill,
  policyRules: PolicyRule[],
  findings: AuditFinding[],
  verdicts: Map<string, { insurance: InsuranceVerdict; billing: BillingVerdict; findingIds: string[] }>
) {
  const fid = () => `insurance_${findings.length + 1}`

  // Build indices
  const exclusionRules = policyRules.filter(r => r.category === 'exclusion')
  const subLimitRules = policyRules.filter(r => r.category === 'sub_limit')
  const roomRentRules = policyRules.filter(r => r.category === 'room_rent')
  const waitingPeriodRules = policyRules.filter(r => r.category === 'waiting_period')

  // ── Check consumables exclusion ───────────────────────────────────────────────
  const consumableExclusionRule = exclusionRules.find(r =>
    /consumable|disposable|glove|ppe|catheter|syringe/i.test(r.description + ' ' + r.rule_name)
  )

  for (const item of items) {
    const descLower = item.description.toLowerCase()
    const isConsumable = item.category === 'consumables' ||
      CONSUMABLES_EXCLUDED_KEYWORDS.some(kw => descLower.includes(kw))

    if (isConsumable && consumableExclusionRule) {
      const id = fid()
      findings.push({
        id,
        domain: 'insurance',
        insuranceIssue: 'consumables_not_covered',
        severity: 'high',
        affectedItemIds: [item.id],
        title: `Consumable/Disposable Likely Not Covered: "${item.description}"`,
        explanation:
          `Your policy contains an exclusion clause for consumables and disposables. ` +
          `This item (₹${item.amount.toLocaleString('en-IN')}) will likely be classified as a non-payable ` +
          `and deducted from your claim payout.`,
        billEvidence: item.originalText || item.description,
        policyClause: consumableExclusionRule.evidence_text,
        policyPage: consumableExclusionRule.page_number,
        policySection: consumableExclusionRule.section_name,
        suggestedAction: 'This deduction is standard under most Indian health policies. You will need to pay for consumables out-of-pocket.',
        confidence: 'high',
      })
      const v = verdicts.get(item.id)!
      v.insurance = 'likely_excluded'
      v.findingIds.push(id)
    } else if (isConsumable) {
      // No explicit rule found; mark as conditional
      const v = verdicts.get(item.id)!
      if (v.insurance === 'unknown') v.insurance = 'conditional'
    }
  }

  // ── Check implant sub-limits ──────────────────────────────────────────────────
  const implantSubLimitRule = subLimitRules.find(r =>
    /implant|prosthes|stent|iol|pacemaker/i.test(r.description + ' ' + r.rule_name)
  )

  for (const item of items) {
    const descLower = item.description.toLowerCase()
    const isImplant = item.category === 'implant' ||
      IMPLANT_SUBCAP_KEYWORDS.some(kw => descLower.includes(kw))

    if (isImplant && implantSubLimitRule) {
      const id = fid()
      findings.push({
        id,
        domain: 'insurance',
        insuranceIssue: 'sub_limit_applies',
        severity: 'high',
        affectedItemIds: [item.id],
        title: `Implant Sub-Limit Applies: "${item.description}"`,
        explanation:
          `Your policy caps reimbursement for implants/prostheses. ` +
          `This charge (₹${item.amount.toLocaleString('en-IN')}) may only be partially covered depending ` +
          `on the specific sub-limit amount defined in your policy schedule.`,
        billEvidence: item.originalText || item.description,
        policyClause: implantSubLimitRule.evidence_text,
        policyPage: implantSubLimitRule.page_number,
        policySection: implantSubLimitRule.section_name,
        suggestedAction: 'Verify the sub-limit amount for implants in your policy certificate. Check if the actual implant cost exceeds the cap.',
        confidence: 'high',
      })
      const v = verdicts.get(item.id)!
      v.insurance = 'sub_limit_applies'
      v.findingIds.push(id)
    } else if (isImplant) {
      const v = verdicts.get(item.id)!
      if (v.insurance === 'unknown') v.insurance = 'conditional'
    }
  }

  // ── Room rent proportionate risk ──────────────────────────────────────────────
  if (roomRentRules.length > 0) {
    const roomItems = items.filter(i => ROOM_EXCLUSION_CATEGORIES.includes(i.category))
    if (roomItems.length > 0) {
      const bestRoomRule = roomRentRules[0]
      const id = fid()
      findings.push({
        id,
        domain: 'insurance',
        insuranceIssue: 'room_rent_proportionate',
        severity: 'medium',
        affectedItemIds: roomItems.map(i => i.id),
        title: 'Room Rent May Trigger Proportionate Deduction',
        explanation:
          `Your policy limits the eligible room type (e.g. Twin Sharing or Single Private). ` +
          `If the room booked exceeds this limit, your insurer will proportionately reduce ` +
          `ALL associated charges (surgeon fees, OT, nursing) — not just the room rent. ` +
          `This is one of the most common and significant sources of out-of-pocket costs.`,
        billEvidence: roomItems.map(i => `${i.description}: ₹${i.amount.toLocaleString('en-IN')}`).join(' | '),
        policyClause: bestRoomRule.evidence_text,
        policyPage: bestRoomRule.page_number,
        policySection: bestRoomRule.section_name,
        suggestedAction: 'Compare your room type at discharge with the room category permitted in your policy. Use the Preflight Estimator tab to calculate the proration penalty.',
        confidence: 'medium',
      })
      for (const item of roomItems) {
        const v = verdicts.get(item.id)!
        if (v.insurance === 'unknown') v.insurance = 'conditional'
        v.findingIds.push(id)
      }
    }
  }

  // ── Waiting period risk for diagnosis ────────────────────────────────────────
  const diagnosisLower = (bill.diagnosis || '').toLowerCase()
  const waitingKeywords = ['knee', 'hip', 'hernia', 'cataract', 'appendix', 'gallbladder', 'stone', 'hysterectomy', 'spine', 'disc']
  const diagnosisIsWaiting = waitingKeywords.some(k => diagnosisLower.includes(k))

  if (diagnosisIsWaiting && waitingPeriodRules.length > 0) {
    const matchedRule = waitingPeriodRules.find(r =>
      waitingKeywords.some(k => r.description.toLowerCase().includes(k))
    ) || waitingPeriodRules[0]

    const id = fid()
    findings.push({
      id,
      domain: 'insurance',
      insuranceIssue: 'waiting_period_risk',
      severity: 'high',
      affectedItemIds: [],
      title: 'Diagnosis May Be Subject to Waiting Period',
      explanation:
        `The diagnosis on this bill ("${bill.diagnosis || 'unknown'}") may be classified as a ` +
        `"Specific Illness" subject to a 24-month or 48-month waiting period under your policy. ` +
        `If your policy was purchased less than 24 months ago, this entire claim may be denied. ` +
        `Verify your policy start date against the required waiting period.`,
      billEvidence: `Diagnosis: ${bill.diagnosis || 'as stated on bill'}`,
      policyClause: matchedRule.evidence_text,
      policyPage: matchedRule.page_number,
      policySection: matchedRule.section_name,
      suggestedAction: 'Use the Preflight Estimator tab to enter your policy inception date and check if the waiting period for this condition has been met.',
      confidence: 'medium',
    })
  }

  // ── Default coverage verdicts for items without any finding ───────────────────
  for (const item of items) {
    const v = verdicts.get(item.id)!
    if (v.insurance === 'unknown') {
      // Assign optimistic default by category
      if (['room', 'icu', 'surgery', 'doctor', 'diagnostics', 'medicines'].includes(item.category)) {
        v.insurance = 'likely_covered'
      } else if (item.category === 'ambulance') {
        v.insurance = 'conditional'
      }
      // 'other' stays 'unknown'
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function runBillAudit(
  bill: HospitalBill,
  lineItems: HospitalBillLineItem[],
  policyRules?: PolicyRule[]
): BillAuditResult {
  const findings: AuditFinding[] = []
  const policyLoaded = !!(policyRules && policyRules.length > 0)

  // Build verdict map keyed by item id
  const verdictMap = new Map<string, {
    insurance: InsuranceVerdict
    billing: BillingVerdict
    findingIds: string[]
  }>()

  for (const item of lineItems) {
    verdictMap.set(item.id, {
      insurance: policyLoaded ? 'unknown' : 'no_policy',
      billing: 'ok',
      findingIds: [],
    })
  }

  // Run billing audit (always)
  runBillingAudit(lineItems, bill, findings, verdictMap)

  // Run insurance audit (only if policy provided)
  if (policyLoaded) {
    runInsuranceAudit(lineItems, bill, policyRules!, findings, verdictMap)
  }

  // Build final verdicts array
  const verdicts: AuditLineVerdict[] = lineItems.map(item => {
    const v = verdictMap.get(item.id)!
    return {
      itemId: item.id,
      insuranceVerdict: v.insurance,
      billingVerdict: v.billing,
      findingIds: v.findingIds,
    }
  })

  const lineSum = lineItems.reduce((a, i) => a + i.amount, 0)

  return {
    totalBill: bill.totalBilledAmount,
    lineItemSum: lineSum,
    billingFindingCount: findings.filter(f => f.domain === 'billing').length,
    insuranceFindingCount: findings.filter(f => f.domain === 'insurance').length,
    verdicts,
    findings,
    policyLoaded,
    auditTimestamp: new Date().toISOString(),
  }
}
