/**
 * ClaimLens - Policy Rule Compiler (Blueprint Section 7)
 * Converts raw LLM extracted policy clauses into controlled, deterministic,
 * executable rules with typed conditions, effects, precedence, and evidence provenance.
 */

import {
  PolicyRule,
  CompiledRule,
  CompiledRuleType,
  RuleCondition,
  RuleEffect,
  PolicyAnalysisResult,
  ExtractedPage,
} from '@/lib/types/policy'
import {
  parseCurrency,
  parsePercentage,
  parseDuration,
  normalizeRoomCategory,
  getCanonicalProcedureKey,
  CANONICAL_PROCEDURES,
} from './normalizers'
import { validateEvidence } from '@/lib/pdf/validation'

export function compilePolicyRules(
  rawRules: PolicyRule[],
  pages?: ExtractedPage[]
): CompiledRule[] {
  const compiled: CompiledRule[] = []

  // Pre-build page map if pages provided
  const pageMap = new Map<number, string>()
  if (pages) {
    for (const p of pages) {
      pageMap.set(p.page_number, p.text)
    }
  }

  for (const raw of rawRules) {
    const rule = compileSingleRule(raw, pageMap)
    compiled.push(rule)
  }

  // Sort by precedence (lower number applied first in pipeline)
  return compiled.sort((a, b) => a.precedence - b.precedence)
}

function compileSingleRule(
  raw: PolicyRule,
  pageMap: Map<number, string>
): CompiledRule {
  const name = raw.rule_name.toLowerCase()
  const desc = (raw.description || '').toLowerCase()
  const val = (raw.value || '').toLowerCase()
  const conditionsText = (raw.conditions || []).join(' ').toLowerCase()
  const allText = `${name} ${desc} ${val} ${conditionsText}`

  // Check evidence verification if not already validated
  let isVerified = raw.evidence_validated
  if (!isVerified && raw.page_number && raw.evidence_text && pageMap.has(raw.page_number)) {
    isVerified = validateEvidence(raw.evidence_text, pageMap.get(raw.page_number)!)
  }

  let ruleType: CompiledRuleType = 'GENERAL_CLAUSE'
  let precedence = 50
  let usability: 'executable' | 'explanatory_only' | 'needs_human_review' = 'explanatory_only'
  const conditions: RuleCondition[] = []
  const appliesTo: string[] = ['all']
  let effect: RuleEffect = { action: 'allow', description: raw.description }
  let effectivePeriod: CompiledRule['effectivePeriod'] = undefined
  let calculationBase = 'admissible_amount'

  // Map appliesTo based on known procedures
  for (const proc of CANONICAL_PROCEDURES) {
    if (allText.includes(proc.key) || proc.aliases.some(a => allText.includes(a))) {
      if (!appliesTo.includes(proc.key)) {
        if (appliesTo.includes('all')) appliesTo.splice(appliesTo.indexOf('all'), 1)
        appliesTo.push(proc.key)
      }
    }
  }

  // 1. WAITING PERIOD (Precedence: 10 - checked first)
  if (raw.category === 'waiting_period' || allText.includes('waiting period')) {
    ruleType = 'WAITING_PERIOD'
    precedence = 10
    const dur = parseDuration(raw.value) || parseDuration(allText)

    let waitType: 'initial' | 'specific_illness' | 'ped' | 'general' = 'general'
    if (allText.includes('pre-existing') || allText.includes('ped')) {
      waitType = 'ped'
      appliesTo.push('ped')
    } else if (allText.includes('initial') || allText.includes('30 day') || allText.includes('first 30')) {
      waitType = 'initial'
    } else if (allText.includes('specific') || allText.includes('2 year') || allText.includes('24 month')) {
      waitType = 'specific_illness'
    }

    if (dur) {
      effectivePeriod = {
        months: dur.months,
        days: dur.days,
        type: waitType,
      }
      conditions.push({
        type: 'waiting_elapsed',
        field: 'policyStartDate',
        operator: '>=',
        value: dur.months,
        description: `Requires policy continuity of at least ${dur.rawText}`,
      })
      effect = {
        action: 'deny',
        description: `Treatment within waiting period of ${dur.rawText} is not admissible.`,
      }
      usability = 'executable'
    } else {
      usability = 'needs_human_review'
    }
  }

  // 2. EXCLUSION (Precedence: 15)
  else if (raw.category === 'exclusion' || raw.status === 'not_covered') {
    ruleType = 'EXCLUSION'
    precedence = 15
    effect = {
      action: 'deny',
      description: raw.description || `Excluded: ${raw.rule_name}`,
    }
    // If it clearly targets an identified procedure
    if (appliesTo.length > 0 && !appliesTo.includes('all')) {
      usability = 'executable'
    } else {
      usability = 'executable'
    }
  }

  // 3. SUM INSURED (Precedence: 20)
  else if (raw.category === 'sum_insured' || allText.includes('sum insured')) {
    ruleType = 'SUM_INSURED'
    precedence = 90 // Upper ceiling
    const currency = parseCurrency(raw.value) || parseCurrency(raw.description)
    if (currency) {
      effect = {
        action: 'cap',
        capAmount: currency,
        amount: currency,
        description: `Overall policy sum insured ceiling ₹${currency.toLocaleString('en-IN')}`,
      }
      usability = 'executable'
    }
  }

  // 4. ROOM LIMIT & PRORATION (Precedence: 30)
  else if (raw.category === 'room_rent' || raw.category === 'icu_limit' || allText.includes('room rent') || allText.includes('room category')) {
    ruleType = 'ROOM_LIMIT'
    precedence = 30
    const currency = parseCurrency(raw.value) || parseCurrency(raw.description)
    const pct = parsePercentage(raw.value) || parsePercentage(raw.description)
    const roomCat = normalizeRoomCategory(raw.value || raw.description)

    const hasProration = allText.includes('proportionate') || allText.includes('prorata') || allText.includes('proration')

    if (hasProration) {
      effect = {
        action: 'proration',
        amount: currency || undefined,
        percentage: pct || undefined,
        calculationBase: 'room_rent',
        description: `Proportionate deduction clause applied if room category exceeds eligible tier (${roomCat}).`,
      }
    } else {
      effect = {
        action: 'room_excess',
        amount: currency || undefined,
        percentage: pct || undefined,
        calculationBase: 'room_rent',
        description: `Excess room rent over eligible tier (${roomCat}) deducted directly.`,
      }
    }

    conditions.push({
      type: 'room_category',
      operator: '>',
      value: roomCat,
      description: `Eligible room category capped at ${roomCat}${pct ? ` or ${pct}% of Sum Insured` : ''}`,
    })
    usability = 'executable'
  }

  // 5. SUB LIMIT (Precedence: 40)
  else if (raw.category === 'sub_limit' || allText.includes('sub limit') || allText.includes('capping')) {
    ruleType = 'SUB_LIMIT'
    precedence = 40
    const currency = parseCurrency(raw.value) || parseCurrency(raw.description)
    const pct = parsePercentage(raw.value) || parsePercentage(raw.description)

    if (currency || pct) {
      effect = {
        action: 'cap',
        capAmount: currency || undefined,
        percentage: pct || undefined,
        calculationBase: 'claim_amount',
        description: `Specific sub-limit capped at ${currency ? `₹${currency.toLocaleString('en-IN')}` : `${pct}% of SI`}`,
      }
      usability = 'executable'
    } else {
      usability = 'needs_human_review'
    }
  }

  // 6. DEDUCTIBLE (Precedence: 50)
  else if (raw.category === 'deductible' || allText.includes('deductible')) {
    ruleType = 'DEDUCTIBLE'
    precedence = 50
    const currency = parseCurrency(raw.value) || parseCurrency(raw.description)
    if (currency) {
      effect = {
        action: 'deduct_fixed',
        amount: currency,
        calculationBase: 'bill_amount',
        description: `Fixed policy deductible of ₹${currency.toLocaleString('en-IN')}`,
      }
      usability = 'executable'
    }
  }

  // 7. CO-PAYMENT (Precedence: 60)
  else if (raw.category === 'co_payment' || allText.includes('co-pay') || allText.includes('copay')) {
    ruleType = 'COPAY'
    precedence = 60
    const pct = parsePercentage(raw.value) || parsePercentage(raw.description)

    // Age conditioned co-pay? E.g., "for age above 60"
    const ageMatch = allText.match(/(?:age|senior citizen|above)\s*(?:above|over|>=)?\s*(\d{2})/i)
    if (ageMatch) {
      const ageThreshold = parseInt(ageMatch[1], 10)
      conditions.push({
        type: 'age',
        operator: '>=',
        value: ageThreshold,
        description: `Co-pay applies to patients age ${ageThreshold} and above.`,
      })
    }

    if (pct) {
      effect = {
        action: 'deduct_percentage',
        percentage: pct,
        calculationBase: 'admissible_amount',
        description: `${pct}% co-payment applies on admissible claim amount.`,
      }
      usability = 'executable'
    }
  }

  // 8. ELIGIBILITY / CLAIM REQUIREMENT (Precedence: 70)
  else if (raw.category === 'eligibility') {
    ruleType = 'ELIGIBILITY'
    precedence = 5
    usability = 'executable'
  } else if (raw.category === 'claim_requirement') {
    ruleType = 'CLAIM_REQUIREMENT'
    precedence = 80
    usability = 'explanatory_only'
  }

  return {
    id: raw.id || `comp_${Math.random().toString(36).substring(2, 9)}`,
    ruleType,
    rawCategory: raw.category,
    ruleName: raw.rule_name,
    appliesTo,
    conditions,
    effect,
    calculationBase,
    precedence,
    effectivePeriod,
    evidence: {
      page: raw.page_number,
      section: raw.section_name,
      quote: raw.evidence_text,
    },
    confidence: raw.confidence,
    verification: isVerified ? 'verified' : 'unverified',
    usability,
    affectsEstimate: usability === 'executable',
  }
}
