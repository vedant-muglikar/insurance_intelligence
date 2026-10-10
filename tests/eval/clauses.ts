/**
 * Clause library for the matcher evaluation. Seventeen short clauses in the style of an Indian health policy
 * (exclusions with and without carve-outs, coverage clauses, a room limit). SYNTHETIC: written for this
 * evaluation, not copied from any insurer's document.
 */

import { compilePolicyRules } from '@/lib/policy/compiler'
import type { ExtractedPage, PolicyAnalysisResult, PolicyCategory, PolicyRule, PolicyStatus } from '@/lib/types/policy'
import { makeVersion, selectVersion } from '@/lib/claims/versions'
import type { MergedRule } from '@/lib/claims/types'

interface ClauseDef {
  id: string
  category: PolicyCategory
  status: PolicyStatus
  name: string
  value: string
  text: string
}

export const CLAUSES: ClauseDef[] = [
  { id: 'E1', category: 'exclusion', status: 'not_covered', name: 'Non-payable consumables and disposables', value: 'Not covered', text: 'Gloves, masks, PPE kits, syringes, catheters, disposable kits and similar consumables and disposables are not payable.' },
  { id: 'E2', category: 'exclusion', status: 'not_covered', name: 'Cosmetic and aesthetic procedures', value: 'Not covered', text: 'Expenses for cosmetic, aesthetic or plastic surgery are excluded, except reconstructive surgery needed following an accident, burn or cancer.' },
  { id: 'E3', category: 'exclusion', status: 'not_covered', name: 'Administrative charges', value: 'Not covered', text: 'Registration, admission, file-processing, documentation and service charges are not payable.' },
  { id: 'E4', category: 'exclusion', status: 'not_covered', name: 'Personal comfort items', value: 'Not covered', text: 'Telephone, television, guest meals, toiletries, slippers and attendant or visitor charges are not payable.' },
  { id: 'E5', category: 'exclusion', status: 'not_covered', name: 'Dental treatment', value: 'Not covered', text: 'Dental treatment is excluded unless it requires hospitalisation due to an accident.' },
  { id: 'E6', category: 'exclusion', status: 'not_covered', name: 'Experimental treatment', value: 'Not covered', text: 'Experimental, investigational or unproven treatments, including stem cell therapy, are not covered.' },
  { id: 'E7', category: 'exclusion', status: 'not_covered', name: 'Obesity surgery', value: 'Not covered', text: 'Bariatric and obesity-control surgery is excluded unless BMI exceeds 40.' },
  { id: 'E8', category: 'exclusion', status: 'not_covered', name: 'Vitamins and supplements', value: 'Not covered', text: 'Vitamins, tonics and nutritional supplements are not payable unless prescribed as part of in-patient treatment.' },
  { id: 'E9', category: 'exclusion', status: 'not_covered', name: 'Aids and appliances', value: 'Not covered', text: 'Spectacles, contact lenses, hearing aids and walking aids are not covered.' },
  { id: 'C1', category: 'coverage', status: 'covered', name: 'Implants and operative consumables', value: 'Covered', text: 'Implants and operative consumables such as sutures and staplers used during the surgery are payable.' },
  { id: 'C2', category: 'coverage', status: 'covered', name: 'Pre-hospitalisation expenses', value: 'Covered', text: 'Medical expenses incurred up to 30 days before hospitalisation are covered if they relate to the same illness.' },
  { id: 'C3', category: 'coverage', status: 'covered', name: 'Post-hospitalisation expenses', value: 'Covered', text: 'Medical expenses incurred up to 60 days after discharge are covered if they relate to the same illness.' },
  { id: 'C4', category: 'coverage', status: 'covered', name: 'Road ambulance', value: 'Covered', text: 'Road ambulance charges up to Rs 2,000 per hospitalisation are covered.' },
  { id: 'C5', category: 'coverage', status: 'covered', name: 'Day care procedures', value: 'Covered', text: 'Day care procedures such as cataract surgery, dialysis and chemotherapy that need less than 24 hours of hospitalisation are covered.' },
  { id: 'C6', category: 'coverage', status: 'covered', name: 'AYUSH treatment', value: 'Covered', text: 'In-patient treatment under Ayurveda, Yoga, Unani, Siddha and Homeopathy at a recognised hospital is covered.' },
  { id: 'C7', category: 'coverage', status: 'covered', name: 'Organ donor expenses', value: 'Covered', text: 'Hospitalisation expenses of the organ donor for harvesting the organ are covered.' },
  { id: 'C8', category: 'room_rent', status: 'conditionally_covered', name: 'Room rent limit', value: '₹5,000 per day', text: 'Room rent is limited to Rs 5,000 per day.' },
]

const PAGE: ExtractedPage = { page_number: 1, text: CLAUSES.map((c) => c.text).join(' '), char_count: 0 }
PAGE.char_count = PAGE.text.length

function policyResult(): PolicyAnalysisResult {
  const rules: PolicyRule[] = CLAUSES.map((c) => ({
    id: c.id,
    category: c.category,
    rule_name: c.name,
    value: c.value,
    description: c.text,
    status: c.status,
    conditions: [],
    page_number: 1,
    section_name: 'Evaluation policy',
    evidence_text: c.text,
    confidence: 'high',
    evidence_validated: true,
  }))
  return {
    overview: { uin: 'EVAL-SYNTHETIC' },
    rules,
    compiled_rules: compilePolicyRules(rules, [PAGE]),
    pages: [PAGE],
    total_pages: 1,
    scanned_pdf_warning: false,
    extraction_stats: { total_rules: rules.length },
    processing_time_ms: 0,
  } as unknown as PolicyAnalysisResult
}

export function evalRules(): MergedRule[] {
  const version = makeVersion({ id: 'eval', label: 'Evaluation policy', documentName: 'eval.pdf', result: policyResult(), kind: 'base', effectiveFrom: '2025-01-01', synthetic: true })
  return selectVersion([version], '2026-01-01').rules
}
