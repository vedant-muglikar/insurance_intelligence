/**
 * PolicyLens - Policy Rule Compiler (Blueprint Section 7)
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

  for (const raw of rawRules.flatMap(splitSubLimits)) {
    const rule = compileSingleRule(raw, pageMap)
    compiled.push(rule)
  }

  // Sort by precedence (lower number applied first in pipeline)
  return compiled.sort((a, b) => a.precedence - b.precedence)
}

/** Categories that name a specific rule type. Anything else ("coverage", "general") is classified by its wording. */
const SPECIFIC_CATEGORIES = new Set<string>([
  'exclusion', 'waiting_period', 'deductible', 'co_payment', 'room_rent', 'icu_limit', 'sub_limit', 'eligibility', 'claim_requirement', 'sum_insured',
])

const RUPEES = /(?:₹|rs\.?|inr)\s*[\d,]+(?:\.\d+)?/i

/** Parts of a list like "Cataract ₹25,000 per eye | Joint replacement implants ₹50,000" that each carry a rupee amount */
function amountSegments(text: string | undefined, separator: RegExp): string[] {
  if (!text) return []
  const body = text.replace(/^[^:|]{0,60}:\s*/, '') // drop a "Sub-limits (per policy year):" lead-in
  return body.split(separator).map((s) => s.trim()).filter((s) => RUPEES.test(s))
}

/**
 * One extracted clause sometimes lists several sub-limits ("Cataract ₹25,000 | Joint replacement implants ₹50,000").
 * Each becomes its own rule, worded from the verbatim evidence where possible, so each amount caps only what it names.
 */
function splitSubLimits(raw: PolicyRule): PolicyRule[] {
  if (raw.category !== 'sub_limit') return [raw]
  const fromEvidence = amountSegments(raw.evidence_text, /\s*[|;]\s*/)
  const fromValue = amountSegments(raw.value, /\s*[|;]\s*|,\s+(?=[A-Za-z])/)
  const parts = fromEvidence.length >= 2 ? fromEvidence : fromValue
  if (parts.length < 2) return [raw]
  return parts.map((part, k) => {
    const label = part.split(RUPEES)[0].replace(/[\s:–-]+$/, '').trim() || `${raw.rule_name} ${k + 1}`
    return {
      ...raw,
      id: `${raw.id}__${k + 1}`,
      rule_name: `${label} sub-limit`,
      value: part,
      description: `${label}: ${part.slice(label.length).trim()}`,
      conditions: [],
    }
  })
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

  // The extracted category decides the rule type. Keyword checks only classify generic clauses
  // ("coverage", "general"): a room-rent clause that mentions "1% of Sum Insured" is still a room-rent clause.
  const cat = raw.category
  const generic = !SPECIFIC_CATEGORIES.has(cat)
  const prorationClause = /proportionate|pro-?rata|proration/.test(allText) && allText.includes('room')
  const is = {
    waiting: cat === 'waiting_period' || (generic && allText.includes('waiting period')),
    exclusion: cat === 'exclusion' || (generic && raw.status === 'not_covered'),
    sumInsured: cat === 'sum_insured' || (generic && name.includes('sum insured')),
    room: cat === 'room_rent' || cat === 'icu_limit' || prorationClause || (generic && (allText.includes('room rent') || allText.includes('room category'))),
    subLimit: cat === 'sub_limit' || (generic && (allText.includes('sub limit') || allText.includes('sub-limit') || allText.includes('capping'))),
    deductible: cat === 'deductible' || (generic && allText.includes('deductible')),
    copay: cat === 'co_payment' || (generic && (allText.includes('co-pay') || allText.includes('copay'))),
  }

  // 1. WAITING PERIOD (Precedence: 10 - checked first)
  if (is.waiting) {
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
  else if (is.exclusion) {
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
  else if (is.sumInsured) {
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
  else if (is.room) {
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

    // An ICU limit is a separate per-day cap on ICU charges, not the room-rent limit. Shown, not yet computed.
    if (cat === 'icu_limit' || /\bicu\b|intensive care/.test(name)) {
      appliesTo.splice(0, appliesTo.length, 'icu')
      effect = { ...effect, action: 'cap', description: `ICU charges limited to ${currency ? `₹${currency.toLocaleString('en-IN')}` : pct ? `${pct}% of Sum Insured` : 'the stated amount'} per day.` }
      usability = 'explanatory_only'
    }
  }

  // 5. SUB LIMIT (Precedence: 40)
  else if (is.subLimit) {
    ruleType = 'SUB_LIMIT'
    precedence = 40
    const currency = parseCurrency(raw.value) || parseCurrency(raw.description)
    const pct = parsePercentage(raw.value) || parsePercentage(raw.description)
    // Several different amounts that could not be split into separate sub-limits: never pick one at random
    const amounts = new Set((`${raw.value} ${raw.description}`.match(new RegExp(RUPEES.source, 'gi')) ?? []).map((a) => parseCurrency(a)))

    if (amounts.size > 1) {
      usability = 'needs_human_review'
    } else if (currency || pct) {
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
  else if (is.deductible) {
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
  else if (is.copay) {
    ruleType = 'COPAY'
    precedence = 60
    const pct = parsePercentage(raw.value) || parsePercentage(raw.description)

    // Age conditioned co-pay? E.g., "for age above 60"
    // "aged 60 years or above", "60 years and above", "age 60+", "above 60"
    const ageMatch =
      allText.match(/\baged?\s+(?:of\s+)?(\d{2})\b/i) ||
      allText.match(/\b(\d{2})\s*(?:years?|yrs?)?\s*(?:of age\s*)?(?:or|and)\s*(?:above|over|older|more)\b/i) ||
      allText.match(/(?:age|senior citizen|above)\s*(?:above|over|>=)?\s*(\d{2})/i)
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

  // Values flagged upstream (e.g. OCR could not read an amount reliably) must
  // never drive the deterministic estimate.
  if (raw.usability === 'needs_human_review' && usability === 'executable') {
    usability = 'needs_human_review'
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
