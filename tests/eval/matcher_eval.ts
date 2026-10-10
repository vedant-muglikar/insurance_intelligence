/**
 * Reproducible evaluation of clause matching: keyword baseline against semantic matching.
 *
 *   npm run eval:matcher                 score from the committed embedding cache (offline, deterministic)
 *   npm run eval:matcher -- --refresh    re-embed with the Gemini API (needs GOOGLE_GENERATIVE_AI_API_KEY in .env), then score
 *   npm run eval:matcher -- --tune       print the best thresholds on the dev split (does not change any file)
 *
 * Writes docs/matching/EVALUATION.md and docs/matching/results.json.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { decideOutcome, type Decision, type Outcome } from '@/lib/claims/decide'
import { keywordMatcher } from '@/lib/claims/matcher'
import type { ClauseMatch, ClauseMatcher, MergedRule } from '@/lib/claims/types'
import { geminiEmbedder, type Embedder } from '@/lib/claims/semantic/embedder'
import { createSemanticMatcher } from '@/lib/claims/semantic/matcher'
import { DEFAULT_SEMANTIC_CONFIG, type SemanticConfig } from '@/lib/claims/semantic/config'
import { CLAUSES, evalRules } from './clauses'
import { EXAMPLES, type Example, type Kind } from './examples'

const CACHE_PATH = 'tests/eval/embeddings.cache.json'
const args = new Set(process.argv.slice(2))

// ─── embedding cache ──────────────────────────────────────────────────────────

interface CacheFile {
  model: string
  vectors: Record<string, number[]>
}
const hashOf = (model: string, text: string) => createHash('sha1').update(`${model}\n${text}`).digest('hex')

function loadCache(): CacheFile | null {
  return existsSync(CACHE_PATH) ? (JSON.parse(readFileSync(CACHE_PATH, 'utf8')) as CacheFile) : null
}

function geminiKey(): string {
  const fromEnv = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (fromEnv) return fromEnv
  if (existsSync('.env')) {
    const m = /^GOOGLE_GENERATIVE_AI_API_KEY=(.+)$/m.exec(readFileSync('.env', 'utf8'))
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  throw new Error('--refresh needs GOOGLE_GENERATIVE_AI_API_KEY in the environment or .env')
}

/** Serves vectors from the cache file. Fetches missing ones only when live is set. Records every text it is asked for. */
function cachedEmbedder(live: Embedder | null, cache: CacheFile | null): Embedder & { used: Map<string, number[]>; modelName: string } {
  const modelName = live?.name ?? cache?.model ?? 'unknown'
  const store = new Map<string, number[]>(Object.entries(cache && cache.model === modelName ? cache.vectors : {}))
  const used = new Map<string, number[]>()
  return {
    name: modelName,
    modelName,
    used,
    async embed(texts) {
      const need = texts.filter((t) => !store.has(hashOf(modelName, t)))
      if (need.length) {
        if (!live) throw new Error(`The embedding cache is missing ${need.length} text(s), for example "${need[0].slice(0, 60)}". Run: npm run eval:matcher -- --refresh`)
        const vecs = await live.embed(need)
        need.forEach((t, i) => store.set(hashOf(modelName, t), vecs[i]))
      }
      return texts.map((t) => {
        const v = store.get(hashOf(modelName, t))!
        used.set(hashOf(modelName, t), v)
        return v
      })
    },
  }
}

// ─── running a method ─────────────────────────────────────────────────────────

interface Prediction {
  outcome: Outcome
  decidingIds: string[]
  ranked: string[]
  top?: ClauseMatch
  decision: Decision
  correct: boolean
  clauseCorrect: boolean
}

function predict(matcher: ClauseMatcher, ex: Example, rules: MergedRule[]): Prediction {
  const matches = matcher.match({ text: ex.text, rules })
  const decision = decideOutcome(matches, matcher.conflictMargin)
  const live = matches.filter((m) => m.verification?.status !== 'unsupported')
  const deciding: string[] = []
  if (decision.outcome === 'exclude') deciding.push(decision.exclusion!.rule.id)
  else if (decision.outcome === 'cover') deciding.push(decision.coverage?.rule.id ?? live.find((m) => ['limit', 'room', 'coverage'].includes(m.role))!.rule.id)
  else if (decision.outcome === 'review') for (const m of [decision.exclusion, decision.coverage]) if (m) deciding.push(m.rule.id)
  const correct = decision.outcome === ex.outcome
  const clauseCorrect = correct && (ex.outcome === 'none' || deciding.some((id) => ex.gold.includes(id)))
  return { outcome: decision.outcome, decidingIds: deciding, ranked: matches.map((m) => m.rule.id), top: live[0] ?? matches[0], decision, correct, clauseCorrect }
}

interface Method {
  key: string
  label: string
  matcher: ClauseMatcher
}

// ─── metrics ──────────────────────────────────────────────────────────────────

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(0)}%` : 'n/a')

/** 95% Wilson interval for a proportion. */
function wilson(k: number, n: number): [number, number] {
  if (!n) return [0, 0]
  const z = 1.96
  const p = k / n
  const den = 1 + (z * z) / n
  const centre = (p + (z * z) / (2 * n)) / den
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den
  return [Math.max(0, centre - half), Math.min(1, centre + half)]
}

function summarize(examples: Example[], preds: Map<string, Prediction>) {
  const n = examples.length
  const strict = examples.filter((e) => preds.get(e.id)!.clauseCorrect).length
  const outcome = examples.filter((e) => preds.get(e.id)!.correct).length
  const withGold = examples.filter((e) => e.gold.length)
  let h1 = 0
  let h3 = 0
  let mrr = 0
  for (const e of withGold) {
    const idx = preds.get(e.id)!.ranked.findIndex((id) => e.gold.includes(id))
    if (idx === 0) h1++
    if (idx >= 0 && idx < 3) h3++
    if (idx >= 0) mrr += 1 / (idx + 1)
  }
  const none = examples.filter((e) => e.outcome === 'none')
  const falseSupport = none.filter((e) => ['exclude', 'cover'].includes(preds.get(e.id)!.outcome)).length
  const decided = examples.filter((e) => ['exclude', 'cover'].includes(preds.get(e.id)!.outcome))
  const decidedRight = decided.filter((e) => preds.get(e.id)!.clauseCorrect).length
  const [lo, hi] = wilson(strict, n)
  return { n, strict, outcome, lo, hi, retrievalN: withGold.length, h1, h3, mrr: withGold.length ? mrr / withGold.length : 0, noneN: none.length, falseSupport, decided: decided.length, decidedRight }
}

// ─── tuning ───────────────────────────────────────────────────────────────────

const range = (from: number, to: number, step: number) => Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => +(from + i * step).toFixed(4))

function* grid(center: boolean): Generator<SemanticConfig> {
  const t = center ? range(0.1, 0.6, 0.05) : range(0.6, 0.9, 0.025)
  for (const supportThreshold of t)
    for (const conditionThreshold of t)
      for (const margin of [0, 0.02, 0.04, 0.06, 0.08, 0.1, 0.15])
        for (const minPeak of [0, 1, 1.5, 2, 2.5, 3])
          yield { retrieveFloor: center ? 0.0 : 0.5, supportThreshold, conditionThreshold, margin, minPeak, topK: 5, center }
}

/** Raw-cosine variant for the ablation, with thresholds chosen the same way on the dev split. */
const RAW_CONFIG: SemanticConfig = { retrieveFloor: 0.5, supportThreshold: 0.6, conditionThreshold: 0.85, margin: 0.02, minPeak: 2, topK: 5, center: false }

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const rules = evalRules()
  const cache = loadCache()
  const live = args.has('--refresh') ? geminiEmbedder(geminiKey()) : null
  const embedder = cachedEmbedder(live, cache)

  // One matcher per configuration, all fed from the same vectors.
  const build = async (cfg: SemanticConfig) => {
    const m = createSemanticMatcher(embedder, cfg)
    await m.prepare(EXAMPLES.map((e) => e.text), rules)
    return m
  }
  const run = (matcher: ClauseMatcher, list: Example[]) => new Map(list.map((e) => [e.id, predict(matcher, e, rules)]))

  const dev = EXAMPLES.filter((e) => e.split === 'dev')
  const test = EXAMPLES.filter((e) => e.split === 'test')

  if (args.has('--tune')) {
    for (const center of [true, false]) {
      let best: { cfg: SemanticConfig; strict: number; outcome: number } | null = null
      for (const cfg of grid(center)) {
        const s = summarize(dev, run(await build(cfg), dev))
        if (!best || s.strict > best.strict || (s.strict === best.strict && s.outcome > best.outcome)) best = { cfg, strict: s.strict, outcome: s.outcome }
      }
      console.log(`${center ? 'Centred' : 'Raw cosine'}: best on the dev split (${dev.length} examples) is ${best!.strict} correct`)
      console.log(JSON.stringify(best!.cfg))
    }
    return
  }

  const cfg = DEFAULT_SEMANTIC_CONFIG
  const methods: Method[] = [
    { key: 'keyword', label: 'Keyword baseline', matcher: keywordMatcher },
    { key: 'semantic_raw', label: 'Semantic, raw cosine (no centring)', matcher: await build(RAW_CONFIG) },
    { key: 'semantic_no_check', label: 'Semantic, no condition check', matcher: await build({ ...cfg, conditionThreshold: 9 }) },
    { key: 'semantic', label: 'Semantic + verification', matcher: await build(cfg) },
  ]

  const all = new Map<string, Map<string, Prediction>>()
  for (const m of methods) all.set(m.key, run(m.matcher, EXAMPLES))

  if (live) {
    const vectors: Record<string, number[]> = {}
    for (const [k, v] of embedder.used) vectors[k] = v.map((x) => Math.round(x * 1e5) / 1e5)
    writeFileSync(CACHE_PATH, JSON.stringify({ model: embedder.modelName, vectors }))
    console.log(`Wrote ${CACHE_PATH}: ${Object.keys(vectors).length} vectors, model ${embedder.modelName}`)
  }

  // ─── report ────────────────────────────────────────────────────────────────
  const kinds: Kind[] = ['paraphrase', 'exclusion', 'carve-out', 'conflict', 'clear-winner', 'missing-evidence', 'keyword-trap']
  const splits: Array<[string, Example[]]> = [['All', EXAMPLES], ['Dev', dev], ['Test', test]]
  const summaries: Record<string, Record<string, ReturnType<typeof summarize>>> = {}
  for (const m of methods) {
    summaries[m.key] = {}
    for (const [name, list] of splits) summaries[m.key][name] = summarize(list, all.get(m.key)!)
    for (const k of kinds) summaries[m.key][k] = summarize(EXAMPLES.filter((e) => e.kind === k), all.get(m.key)!)
  }

  const sem = all.get('semantic')!
  const kw = all.get('keyword')!
  const semWins = EXAMPLES.filter((e) => sem.get(e.id)!.clauseCorrect && !kw.get(e.id)!.clauseCorrect).length
  const kwWins = EXAMPLES.filter((e) => !sem.get(e.id)!.clauseCorrect && kw.get(e.id)!.clauseCorrect).length
  const bothRight = EXAMPLES.filter((e) => sem.get(e.id)!.clauseCorrect && kw.get(e.id)!.clauseCorrect).length

  const row = (label: string, key: string, scope: string) => {
    const s = summaries[key][scope]
    return `| ${label} | ${s.strict}/${s.n} (${pct(s.strict, s.n)}) | ${(s.lo * 100).toFixed(0)}-${(s.hi * 100).toFixed(0)}% | ${s.outcome}/${s.n} |`
  }
  let md = `# Clause matching evaluation\n\n`
  md += `Generated by \`npm run eval:matcher\` from the committed embedding cache (\`${CACHE_PATH}\`, model \`${embedder.modelName}\`). No network or API key is needed to reproduce it.\n\n`
  md += `**What is measured.** For each of ${EXAMPLES.length} labelled bill lines, a matcher returns candidate clauses from a ${CLAUSES.length}-clause policy library, and the ledger's real decision rule (\`lib/claims/decide.ts\`) turns them into one of four outcomes: exclude, cover, review (a person decides) or none (no clause speaks to it). *Correct* means the outcome matches the label **and** the clause that decided it is one of the clauses the label names.\n\n`
  md += `**Read this first.** The examples and clauses are synthetic and were written by the same team that built both matchers, ${EXAMPLES.length} is a small sample, and the paraphrase cases were chosen to test what keyword matching cannot do. The numbers show that semantic matching helps on this set. They are not an estimate of accuracy on real insurer documents. Thresholds were chosen on the ${dev.length} dev examples only; the ${test.length} test examples were not used to choose them.\n\n`
  md += `## Results\n\n| Method | Correct, all ${EXAMPLES.length} | 95% interval | Outcome only |\n|---|---|---|---|\n`
  for (const m of methods) md += row(m.label, m.key, 'All') + '\n'
  md += `\nHeld-out test split (${test.length} examples):\n\n| Method | Correct | 95% interval | Outcome only |\n|---|---|---|---|\n`
  for (const m of methods) md += row(m.label, m.key, 'Test') + '\n'
  md += `\nDev split (${dev.length} examples, used to choose thresholds):\n\n| Method | Correct | 95% interval | Outcome only |\n|---|---|---|---|\n`
  for (const m of methods) md += row(m.label, m.key, 'Dev') + '\n'
  md += `\nSemantic + verification against the keyword baseline, example by example: semantic only right on **${semWins}**, keyword only right on **${kwWins}**, both right on **${bothRight}**, both wrong on **${EXAMPLES.length - semWins - kwWins - bothRight}**.\n\n`

  md += `## By kind of example\n\n| Kind | n | ${methods.map((m) => m.label).join(' | ')} |\n|---|---|${methods.map(() => '---').join('|')}|\n`
  for (const k of kinds) md += `| ${k} | ${summaries.keyword[k].n} | ${methods.map((m) => `${summaries[m.key][k].strict}/${summaries[m.key][k].n}`).join(' | ')} |\n`

  md += `\n## Retrieval quality\n\nOver the ${summaries.keyword.All.retrievalN} examples that name a clause. Rank is the position of the first correct clause in the matcher's list, before the support check.\n\n| Method | Top-1 | In top 3 | Mean reciprocal rank |\n|---|---|---|---|\n`
  for (const m of methods) {
    const s = summaries[m.key].All
    md += `| ${m.label} | ${s.h1}/${s.retrievalN} (${pct(s.h1, s.retrievalN)}) | ${s.h3}/${s.retrievalN} (${pct(s.h3, s.retrievalN)}) | ${s.mrr.toFixed(2)} |\n`
  }

  md += `\n## Does the clause really support the reading?\n\nTwo checks on whether a match is trustworthy. *False support*: lines with no applicable clause that the matcher still excluded or covered. *Decision precision*: of the lines it excluded or covered, how many were right, with the right clause.\n\n| Method | False support | Decision precision |\n|---|---|---|\n`
  for (const m of methods) {
    const s = summaries[m.key].All
    md += `| ${m.label} | ${s.falseSupport}/${s.noneN} | ${s.decidedRight}/${s.decided} (${pct(s.decidedRight, s.decided)}) |\n`
  }
  md += `\nThe verification step makes three checks before a clause can decide an item. (1) Vectors are centred on the mean of the clause passages, so scores separate related from unrelated text. (2) The clause's closest passage must reach the support threshold (${cfg.supportThreshold}) and must stand out from the item's scores against all other clauses by ${cfg.minPeak} standard deviations; a flat spread means nothing really speaks to the line. (3) If the clause has an exception or condition ("except", "unless", "subject to") and the line is close to that part (${cfg.conditionThreshold}), the match is conditional and the ledger sends the item to a reviewer instead of acting on it. The passage that carried each match is quoted in the table above.\n\n`
  md += `Configuration: ${JSON.stringify(cfg)}\n\n`

  md += `## Every example\n\nLabel is what a reviewer would conclude. Each method column shows its outcome and deciding clause; a tick means correct (outcome and clause).\n\n`
  md += `| Id | Split | Kind | Bill line | Label | Keyword | Semantic, no check | Semantic + verification | Passage that carried the match |\n|---|---|---|---|---|---|---|---|---|\n`
  const cell = (p: Prediction) => `${p.clauseCorrect ? '✓' : '✗'} ${p.outcome}${p.decidingIds.length ? ' ' + p.decidingIds.join('+') : ''}`
  for (const e of EXAMPLES) {
    const s = sem.get(e.id)!
    const span = s.top?.verification ? `"${s.top.verification.span}" (${s.top.verification.similarity.toFixed(2)}, ${s.top.verification.status})` : ''
    md += `| ${e.id} | ${e.split} | ${e.kind} | ${e.text} | ${e.outcome}${e.gold.length ? ' ' + e.gold.join('/') : ''} | ${cell(kw.get(e.id)!)} | ${cell(all.get('semantic_no_check')!.get(e.id)!)} | ${cell(s)} | ${span} |\n`
  }

  const misses = EXAMPLES.filter((e) => !sem.get(e.id)!.clauseCorrect)
  md += `\n## Where semantic matching is still wrong\n\n`
  md += misses.length
    ? misses.map((e) => `- **${e.id}** "${e.text}": labelled ${e.outcome}${e.gold.length ? ' ' + e.gold.join('/') : ''}, got ${sem.get(e.id)!.outcome}${sem.get(e.id)!.decidingIds.length ? ' ' + sem.get(e.id)!.decidingIds.join('+') : ''}.`).join('\n')
    : 'None on this set.'
  md += `\n\n## Limits\n\n- Small, synthetic, single-author labels. Re-run with a larger set from real policies before relying on the numbers.\n- Thresholds were tuned on ${dev.length} examples, so they may be overfit to this clause library. Centring helps on dev but scores the same as raw cosine on the test split, so treat its benefit as unproven.\n- The keyword baseline does better on the conflict cases: it flags a conflict whenever an exclusion and a coverage clause share a word, while the semantic matcher often lets the coverage clause win by the margin. Closing that gap needs a better conflict rule, not a better embedding.\n- The condition check is a similarity test, not reasoning. It cannot read a number: "BMI 33" is sent to review because it is near a BMI condition, not because 33 is below 40.\n- Embeddings come from \`${embedder.modelName}\`. A different model or dimension needs \`--refresh\` and new thresholds.\n`

  mkdirSync('docs/matching', { recursive: true })
  writeFileSync('docs/matching/EVALUATION.md', md)
  writeFileSync(
    'docs/matching/results.json',
    JSON.stringify(
      {
        model: embedder.modelName,
        config: cfg,
        counts: { examples: EXAMPLES.length, dev: dev.length, test: test.length, clauses: CLAUSES.length },
        summaries,
        paired: { semanticOnly: semWins, keywordOnly: kwWins, both: bothRight },
        examples: EXAMPLES.map((e) => ({ ...e, predictions: Object.fromEntries(methods.map((m) => { const p = all.get(m.key)!.get(e.id)!; return [m.key, { outcome: p.outcome, clauses: p.decidingIds, correct: p.clauseCorrect }] })) })),
      },
      null,
      2,
    ),
  )

  for (const m of methods) {
    const a = summaries[m.key].All
    const t = summaries[m.key].Test
    console.log(`${m.label.padEnd(32)} all ${a.strict}/${a.n}   test ${t.strict}/${t.n}   top-1 ${a.h1}/${a.retrievalN}   false support ${a.falseSupport}/${a.noneN}`)
  }
  console.log('Wrote docs/matching/EVALUATION.md and docs/matching/results.json')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
