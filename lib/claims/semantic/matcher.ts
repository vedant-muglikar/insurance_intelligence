/**
 * Semantic clause matcher. Bill wording and clause passages are compared as embedding vectors, then each candidate
 * is checked against the clause's own words before it can count.
 *
 *  1. Retrieve. Every clause passage is scored against the item. A clause scores its best passage.
 *  2. Verify. The best passage must clear the support threshold. If the clause has an exception or condition
 *     ("except", "unless", "subject to") and the item is close to that part, the match is conditional: it is shown,
 *     and the ledger sends it to a reviewer instead of acting on it.
 *
 * The matcher is synchronous, as ClauseMatcher requires, so vectors are fetched first with prepare().
 */

import type { ClauseMatch, ClauseMatcher, ClauseVerification, MergedRule } from '../types'
import { roleOf } from '../matcher'
import { clauseChunks, type ClauseChunks } from './clauseText'
import { cosine, normalize, type Embedder } from './embedder'
import { DEFAULT_SEMANTIC_CONFIG, type SemanticConfig } from './config'

export interface SemanticMatcher extends ClauseMatcher {
  /** Embeds the item texts and every clause passage that has no vector yet. Call before adjudicating. */
  prepare(itemTexts: string[], rules: MergedRule[]): Promise<void>
  config: SemanticConfig
}

const key = (rule: MergedRule) => `${rule.versionId}:${rule.rule.id}`

export function createSemanticMatcher(embedder: Embedder, config: SemanticConfig = DEFAULT_SEMANTIC_CONFIG): SemanticMatcher {
  const vectors = new Map<string, number[]>()
  const chunkCache = new Map<string, ClauseChunks>()
  const chunksOf = (m: MergedRule) => {
    let c = chunkCache.get(key(m))
    if (!c) chunkCache.set(key(m), (c = clauseChunks(m)))
    return c
  }
  /**
   * Embedding spaces are lopsided: unrelated sentences from one domain still score 0.8 or more. Subtracting the mean
   * of the clause passages removes that shared direction, so scores separate related from unrelated text.
   * It uses no labels. The mean is rebuilt whenever prepare() adds vectors.
   */
  let centre: number[] | null = null
  let centred = new Map<string, number[]>()
  const spanTexts = new Set<string>()
  const vec = (text: string) => {
    const raw = vectors.get(text)
    if (!raw) throw new Error(`Semantic matcher has no vector for "${text.slice(0, 60)}". Call prepare() with this text first.`)
    if (!config.center || !centre) return raw
    let v = centred.get(text)
    if (!v) centred.set(text, (v = normalize(raw.map((x, i) => x - centre![i]))))
    return v
  }
  const rebuildCentre = () => {
    centred = new Map()
    centre = null
    if (!config.center || !spanTexts.size) return
    const sum = new Array<number>(vectors.get([...spanTexts][0])!.length).fill(0)
    for (const t of spanTexts) vectors.get(t)!.forEach((x, i) => (sum[i] += x))
    centre = sum.map((x) => x / spanTexts.size)
  }

  return {
    name: `semantic (${embedder.name})`,
    method: 'semantic-embedding',
    conflictMargin: config.margin,
    config,

    async prepare(itemTexts, rules) {
      const need = new Set<string>()
      for (const t of itemTexts) need.add(t.trim())
      for (const m of rules) {
        const c = chunksOf(m)
        for (const s of c.spans) {
          need.add(s)
          spanTexts.add(s)
        }
        if (c.condition) need.add(c.condition)
      }
      const missing = [...need].filter((t) => t && !vectors.has(t))
      if (missing.length) {
        const out = await embedder.embed(missing)
        missing.forEach((t, i) => vectors.set(t, out[i]))
      }
      rebuildCentre()
    },

    match({ text, rules }) {
      const itemVec = vec(text.trim())
      const scored = rules.map((m) => {
        const c = chunksOf(m)
        let best = { span: '', sim: -Infinity }
        for (const sp of c.spans) {
          const sim = cosine(itemVec, vec(sp))
          if (sim > best.sim) best = { span: sp, sim }
        }
        return { m, c, best }
      })
      const mean = scored.reduce((a, x) => a + x.best.sim, 0) / (scored.length || 1)
      const sd = Math.sqrt(scored.reduce((a, x) => a + (x.best.sim - mean) ** 2, 0) / (scored.length || 1)) || 1
      const found: ClauseMatch[] = []
      for (const { m, c, best } of scored) {
        if (best.sim < config.retrieveFloor) continue
        const peak = (best.sim - mean) / sd
        const condSim = c.condition ? cosine(itemVec, vec(c.condition)) : undefined
        let verification: ClauseVerification
        if (best.sim < config.supportThreshold || peak < config.minPeak) {
          verification = {
            status: 'unsupported',
            span: best.span,
            similarity: best.sim,
            peak,
            evidenceSource: c.source,
            reason:
              best.sim < config.supportThreshold
                ? `The closest passage ("${best.span}") is not close enough to the item to support applying this clause.`
                : `The item is about as close to many other clauses as to this one, so this clause does not clearly speak to it.`,
          }
        } else if (c.condition && condSim !== undefined && condSim >= config.conditionThreshold) {
          verification = {
            status: 'conditional',
            span: best.span,
            similarity: best.sim,
            peak,
            condition: c.condition,
            conditionSimilarity: condSim,
            evidenceSource: c.source,
            reason: `The clause names "${best.span}", but it also has a condition ("${c.condition}") that this item is close to. A person must decide whether it applies.`,
          }
        } else {
          verification = {
            status: 'supported',
            span: best.span,
            similarity: best.sim,
            peak,
            condition: c.condition,
            conditionSimilarity: condSim,
            evidenceSource: c.source,
            reason: `The clause passage "${best.span}" matches the item${c.condition ? ' and the item does not touch the clause condition' : ''}.`,
          }
        }
        found.push({
          rule: m.rule,
          versionId: m.versionId,
          versionLabel: m.versionLabel,
          role: roleOf(m),
          score: best.sim,
          matchedTerms: [best.span],
          method: 'semantic-embedding',
          verification,
        })
      }
      return found.sort((a, b) => b.score - a.score).slice(0, config.topK)
    },
  } as SemanticMatcher
}
