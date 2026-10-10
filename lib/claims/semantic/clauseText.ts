/**
 * Splits a policy clause into the passages a bill item can be compared with, and separates any exception or
 * condition from the main statement. The passages are copied from the clause, so a match can quote them.
 */

import type { MergedRule } from '../types'

export interface ClauseChunks {
  /** Where the words came from. The verbatim evidence quote is preferred. */
  source: 'quote' | 'description'
  /** Passages that state what the clause is about: the rule name, each sentence's main part, each listed member. */
  spans: string[]
  /** What follows "except", "unless" and similar words, when present. */
  condition?: string
}

const CONDITION = /\b(?:except(?:\s+for)?|unless|other\s+than|excluding|save\s+for|provided\s+that|only\s+if|only\s+when|subject\s+to)\b/i
const LIST_LEAD = /\b(?:such\s+as|including|like|namely|e\.g\.?)\b/i
const VERB_TAIL = /\s*\b(?:is|are|shall\s+be|will\s+be|stands?)\b\s*(?:not\s+)?(?:payable|covered|admissible|excluded|reimbursable|allowed|permitted|applicable)\b.*$/i
const FILLER = /^(?:and|or|etc|similar|other|the|a|an|used|during|the surgery)$/i

function clean(s: string): string {
  return s.replace(/\s+/g, ' ').replace(VERB_TAIL, '').replace(/^[\s,;:.\-–]+|[\s,;:.\-–]+$/g, '').trim()
}

export function clauseChunks(m: MergedRule): ClauseChunks {
  const quote = (m.rule.evidence?.quote ?? '').trim()
  const useQuote = quote.length >= 20 && quote.length <= 700
  const source: ClauseChunks['source'] = useQuote ? 'quote' : 'description'
  const body = useQuote ? quote : m.text
  const spans: string[] = []
  const add = (s: string) => {
    const c = clean(s)
    if (c.length >= 3 && !FILLER.test(c) && !spans.includes(c)) spans.push(c)
  }
  let condition: string | undefined

  add(m.rule.ruleName)
  for (const sentence of body.split(/(?<=[.;])\s+(?=[A-Z0-9])/)) {
    const cut = CONDITION.exec(sentence)
    const main = cut ? sentence.slice(0, cut.index) : sentence
    if (cut) condition = [condition, clean(sentence.slice(cut.index + cut[0].length))].filter(Boolean).join('; ')
    add(main)
    const lead = LIST_LEAD.exec(main)
    const listPart = lead ? main.slice(lead.index + lead[0].length) : main
    const members = listPart.split(/\s*,\s*|\s+(?:and|or)\s+/i)
    if (members.length >= 3 || lead) for (const part of members) add(part)
  }
  return { source, spans, condition: condition || undefined }
}
