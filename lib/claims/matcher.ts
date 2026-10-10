/**
 * Baseline clause matcher: links a bill item's wording to the policy clauses it may fall under, by shared
 * specific words after light stemming and a small synonym table. This is the keyword baseline. The adjudication
 * engine only talks to the ClauseMatcher interface, so a semantic matcher can replace it and be scored against
 * this one on the same labelled examples.
 */

import type { BillLineCategory } from '@/lib/types/bill'
import type { ClauseMatch, ClauseMatcher, ClauseRole, MergedRule } from './types'

const GENERIC = new Set(
  (
    'the and for are was were with this that have has does did from into about charges charge hospital treatment expense expenses policy medical ' +
    'medically necessary surgery surgical procedure operation patient claim claims covered cover coverage payable not per each any all other ' +
    'including such than only under above below within which been will shall may rs inr rupees limit limits limited cap capped amount exceed ' +
    'exceeds applicable applies apply year sub fee service eligible category excluded excludes exclusion exclusions deducted deduction scheme plan'
  ).split(' '),
)

export function stem(raw: string): string {
  const t = raw.toLowerCase()
  if (t.length > 4 && t.endsWith('ies')) return t.slice(0, -3) + 'y'
  if (t.length > 4 && /(ss|x|ch|sh|z)es$/.test(t)) return t.slice(0, -2)
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1)
  return t
}

export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z-]{2,}/g) ?? []).flatMap((w) => w.split('-')).map(stem).filter((t) => t.length > 2 && !GENERIC.has(t))
}

/** What else a bill word implies. Item side only, so a clause is matched on its own words. */
const SYNONYMS: Record<string, string[]> = {
  glove: ['consumable', 'disposable'],
  syringe: ['consumable', 'disposable'],
  ppe: ['consumable', 'disposable'],
  mask: ['consumable', 'disposable'],
  catheter: ['consumable', 'disposable'],
  drape: ['consumable', 'disposable'],
  gown: ['consumable', 'disposable'],
  trocar: ['consumable', 'disposable'],
  dressing: ['consumable', 'disposable'],
  kit: ['disposable'],
  sterile: ['consumable', 'disposable'],
  registration: ['administrative', 'nonmedical'],
  admission: ['administrative'],
  processing: ['administrative'],
  documentation: ['administrative'],
  slipper: ['comfort', 'nonmedical'],
  toiletry: ['comfort', 'nonmedical'],
  mattress: ['comfort'],
  prosthesis: ['implant'],
  stent: ['implant'],
  iol: ['implant', 'lens'],
  intraocular: ['lens'],
  suture: ['operative'],
  stapler: ['operative'],
}

const CATEGORY_TERMS: Partial<Record<BillLineCategory, string[]>> = {
  consumables: ['consumable', 'disposable'],
  implant: ['implant'],
  room: ['room', 'bed', 'accommodation'],
  icu: ['room', 'icu', 'accommodation'],
  ambulance: ['ambulance', 'transport'],
}

export function roleOf(m: MergedRule): ClauseRole {
  switch (m.rule.ruleType) {
    case 'EXCLUSION':
      return 'exclusion'
    case 'SUB_LIMIT':
      return 'limit'
    case 'ROOM_LIMIT':
      return 'room'
    case 'WAITING_PERIOD':
      return 'waiting'
    case 'GENERAL_CLAUSE':
      return m.rule.rawCategory === 'coverage' ? 'coverage' : 'other'
    default:
      return 'other'
  }
}

export const keywordMatcher: ClauseMatcher = {
  name: 'keyword-baseline',
  match({ text, category, rules }) {
    const itemStems = new Set(tokens(text))
    for (const s of [...itemStems]) for (const x of SYNONYMS[s] ?? []) itemStems.add(x)
    for (const x of category ? CATEGORY_TERMS[category] ?? [] : []) itemStems.add(x)

    const out: ClauseMatch[] = []
    for (const m of rules) {
      const ruleStems = new Set(tokens(m.text))
      const hit = [...ruleStems].filter((s) => itemStems.has(s))
      if (!hit.length) continue
      out.push({
        rule: m.rule,
        versionId: m.versionId,
        versionLabel: m.versionLabel,
        role: roleOf(m),
        score: hit.length,
        matchedTerms: hit,
        method: 'keyword-baseline',
      })
    }
    return out.sort((a, b) => b.score - a.score)
  },
}
