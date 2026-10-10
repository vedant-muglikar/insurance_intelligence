/**
 * Saved analyses in Supabase (plan_templates, compiled_rules, extracted_pages).
 * Server-only: uses the service-role client. Every function fails soft (returns null or false) so a missing key,
 * a missing migration or a network error falls back to the normal LLM path instead of breaking the upload.
 */

import { createAdminClient } from '@/utils/supabase/admin'
import { EXTRACTION_VERSION, textSimilarity } from './identity'
import type { CompiledRule, ExtractedPage, PolicyOverview, PolicyRule } from '@/lib/types/policy'

/** A stored document with the same UIN is only reused if its text is at least this similar to the upload. */
const SAME_DOCUMENT_SIMILARITY = 0.8

export interface SavedAnalysis {
  planTemplateId: string
  overview: PolicyOverview
  rules: PolicyRule[]
  compiledRules: CompiledRule[]
  pages: ExtractedPage[]
  matchedBy: 'hash' | 'uin'
}

type Row = Record<string, any>

export function storeEnabled(): boolean {
  return createAdminClient() !== null
}

// ─── row mapping ─────────────────────────────────────────────────────────────

function toRuleRow(templateId: string, r: CompiledRule): Row {
  return {
    plan_template_id: templateId,
    rule_key: r.id,
    rule_type: r.ruleType,
    raw_category: r.rawCategory,
    rule_name: r.ruleName,
    applies_to: r.appliesTo,
    conditions: r.conditions,
    effect: r.effect,
    calculation_base: r.calculationBase ?? null,
    precedence: r.precedence,
    effective_period: r.effectivePeriod ?? null,
    evidence: r.evidence,
    confidence: r.confidence,
    verification: r.verification,
    usability: r.usability,
    affects_estimate: r.affectsEstimate ?? null,
  }
}

function fromRuleRow(r: Row): CompiledRule {
  return {
    id: r.rule_key || r.id,
    ruleType: r.rule_type,
    rawCategory: r.raw_category,
    ruleName: r.rule_name,
    appliesTo: r.applies_to ?? [],
    conditions: r.conditions ?? [],
    effect: r.effect,
    calculationBase: r.calculation_base ?? undefined,
    precedence: r.precedence,
    effectivePeriod: r.effective_period ?? undefined,
    evidence: r.evidence ?? { page: null, quote: '' },
    confidence: r.confidence ?? 'low',
    verification: r.verification ?? 'unverified',
    usability: r.usability ?? 'needs_human_review',
    affectsEstimate: r.affects_estimate ?? undefined,
  }
}

// ─── reading ─────────────────────────────────────────────────────────────────

/** Pages of a saved template, in order. Cached briefly because the chatbot asks for them on every question. */
const pageCache = new Map<string, { at: number; pages: ExtractedPage[]; rules: PolicyRule[] }>()
const PAGE_TTL_MS = 10 * 60 * 1000

export async function loadPages(templateId: string): Promise<ExtractedPage[] | null> {
  const db = createAdminClient()
  if (!db) return null
  const { data, error } = await db
    .from('extracted_pages')
    .select('page_number,text,char_count')
    .eq('plan_template_id', templateId)
    .order('page_number', { ascending: true })
    .limit(2000)
  if (error || !data?.length) return null
  return data.map((p: Row) => ({ page_number: p.page_number, text: p.text, char_count: p.char_count }))
}

/** Pages plus the display rules of a template, for the chatbot. */
export async function loadChatContext(templateId: string): Promise<{ pages: ExtractedPage[]; rules: PolicyRule[] } | null> {
  const hit = pageCache.get(templateId)
  if (hit && Date.now() - hit.at < PAGE_TTL_MS) return hit

  const db = createAdminClient()
  if (!db) return null
  const [pages, tpl] = await Promise.all([
    loadPages(templateId),
    db.from('plan_templates').select('rules').eq('id', templateId).maybeSingle(),
  ])
  if (!pages) return null
  const ctx = { at: Date.now(), pages, rules: ((tpl.data?.rules as PolicyRule[] | null) ?? []) }
  if (pageCache.size > 20) pageCache.delete(pageCache.keys().next().value as string)
  pageCache.set(templateId, ctx)
  return ctx
}

async function hydrate(tpl: Row, matchedBy: 'hash' | 'uin'): Promise<SavedAnalysis | null> {
  const db = createAdminClient()!
  const [pages, rulesRes] = await Promise.all([
    loadPages(tpl.id),
    db.from('compiled_rules').select('*').eq('plan_template_id', tpl.id).order('precedence', { ascending: true }),
  ])
  // A template is only usable once all of its pages were saved (a save in progress, or one that failed halfway).
  if (!pages || (tpl.page_count && pages.length !== tpl.page_count)) return null
  if (!tpl.overview || !Array.isArray(tpl.rules) || rulesRes.error) return null
  return {
    planTemplateId: tpl.id,
    overview: tpl.overview as PolicyOverview,
    rules: tpl.rules as PolicyRule[],
    compiledRules: (rulesRes.data ?? []).map(fromRuleRow),
    pages,
    matchedBy,
  }
}

/**
 * Finds a saved analysis for this upload.
 *  1. Exact: same document hash.
 *  2. Same UIN (exact string, so a different version never matches) AND the stored text is the same document.
 * Name, insurer and plan title are never used to match.
 */
export async function findSavedAnalysis(args: {
  uin: string | null
  hash: string
  pages: ExtractedPage[]
}): Promise<SavedAnalysis | null> {
  const db = createAdminClient()
  if (!db) return null
  try {
    const byHash = await db
      .from('plan_templates')
      .select('*')
      .eq('source_document_hash', args.hash)
      .eq('extraction_version', EXTRACTION_VERSION)
      .limit(1)
    if (byHash.error) throw byHash.error
    if (byHash.data?.[0]) {
      const hit = await hydrate(byHash.data[0], 'hash')
      if (hit) return hit
    }

    if (args.uin) {
      const byUin = await db
        .from('plan_templates')
        .select('*')
        .eq('uin_version', args.uin)
        .eq('extraction_version', EXTRACTION_VERSION)
        .order('created_at', { ascending: false })
        .limit(5)
      if (byUin.error) throw byUin.error
      for (const tpl of byUin.data ?? []) {
        const stored = await loadPages(tpl.id)
        if (!stored || textSimilarity(args.pages, stored) < SAME_DOCUMENT_SIMILARITY) continue
        const hit = await hydrate(tpl, 'uin')
        if (hit) return hit
      }
    }
  } catch (err) {
    console.warn('[policy store] lookup failed, falling back to LLM extraction:', (err as Error)?.message)
  }
  return null
}

// ─── writing ─────────────────────────────────────────────────────────────────

export async function saveAnalysis(args: {
  uin: string | null
  hash: string
  overview: PolicyOverview
  rules: PolicyRule[]
  compiledRules: CompiledRule[]
  pages: ExtractedPage[]
  confidence: 'high' | 'medium' | 'low'
}): Promise<string | null> {
  const db = createAdminClient()
  if (!db) return null
  let templateId: string | null = null
  try {
    const ins = await db
      .from('plan_templates')
      .insert({
        insurer: args.overview.insurer || 'Unknown',
        product_name: args.overview.plan_name || 'Unknown',
        uin_version: args.uin,
        source_document_hash: args.hash,
        template_confidence: args.confidence,
        overview: args.overview,
        rules: args.rules,
        sum_insured_amount: args.overview.sum_insured_amount ?? null,
        page_count: args.pages.length,
        extraction_version: EXTRACTION_VERSION,
      })
      .select('id')
      .single()

    if (ins.error) {
      // Two uploads of the same file at once: the unique index rejects the second, so reuse the first.
      if (ins.error.code === '23505') {
        const again = await db.from('plan_templates').select('id').eq('source_document_hash', args.hash).limit(1)
        return again.data?.[0]?.id ?? null
      }
      throw ins.error
    }
    templateId = ins.data.id as string

    const chunks = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n))

    for (const part of chunks(args.pages, 40)) {
      const { error } = await db.from('extracted_pages').insert(
        part.map((p) => ({ plan_template_id: templateId, page_number: p.page_number, text: p.text, char_count: p.char_count })),
      )
      if (error) throw error
    }
    for (const part of chunks(args.compiledRules, 100)) {
      const { error } = await db.from('compiled_rules').insert(part.map((r) => toRuleRow(templateId!, r)))
      if (error) throw error
    }
    return templateId
  } catch (err) {
    console.warn('[policy store] save failed, continuing without saving:', (err as Error)?.message)
    if (templateId) {
      // Do not leave a half-saved template behind.
      await db.from('compiled_rules').delete().eq('plan_template_id', templateId)
      await db.from('extracted_pages').delete().eq('plan_template_id', templateId)
      await db.from('plan_templates').delete().eq('id', templateId)
    }
    return null
  }
}
