'use client'

import type { PolicyAnalysisResult, PolicyCategory, PolicyRule } from '@/lib/types/policy'
import { useMemo, useState } from 'react'
import {
  ArrowRight,
  Calculator,
  ChatCircleDots,
  ListChecks,
  MagnifyingGlass,
  Scales,
  ShieldCheck,
  UploadSimple,
  Warning,
} from '@phosphor-icons/react'
import { RuleCard, EvidenceViewer } from './shared'
import { PolicyQA, useChatState } from './PolicyQA'
import { EstimateForm } from './EstimateForm'
import { ClaimDispute } from './ClaimDispute'
import { Brand } from '../ui/Brand'
import { ThemeToggle } from '../ui/ThemeToggle'
import { UserMenu } from '../ui/UserMenu'
import { TranslateButton } from '../ui/TranslateButton'
import { ExtractionQuality } from './ExtractionQuality'
import { PreparationChecklist } from './checklist/PreparationChecklist'
import { toChecklistScenario, toPreflightSignals } from './checklist/useChecklist'
import type { CoverageResult, TreatmentScenario } from '@/lib/types/estimate'

// ─── Views ────────────────────────────────────────────────────────────────────

type View = 'policy' | 'estimate' | 'checklist' | 'ask' | 'claims'

const VIEWS: { id: View; label: string; title: string; sub: string; Icon: any }[] = [
  { id: 'policy', label: 'Overview', title: 'Policy overview', sub: 'What your policy covers, limits and excludes.', Icon: ShieldCheck },
  { id: 'estimate', label: 'Estimator', title: 'Cost estimator', sub: 'Plan a hospital stay and see what you would pay.', Icon: Calculator },
  { id: 'checklist', label: 'Checklist', title: 'Preparation checklist', sub: 'Tasks to finish before admission, taken from your policy.', Icon: ListChecks },
  { id: 'ask', label: 'Ask AI', title: 'Ask your policy', sub: 'Questions in text or voice, and bill checks.', Icon: ChatCircleDots },
  { id: 'claims', label: 'Disputes', title: 'Claim disputes', sub: 'Build a reply to a rejected claim from your policy.', Icon: Scales },
]

type RuleGroup = 'covered' | 'not' | 'waiting' | 'limits' | 'who' | 'steps'

const RULE_GROUPS: { id: RuleGroup; label: string; cats: PolicyCategory[] }[] = [
  { id: 'covered', label: 'Covered', cats: ['coverage'] },
  { id: 'not', label: 'Not covered', cats: ['exclusion'] },
  { id: 'waiting', label: 'Waiting periods', cats: ['waiting_period'] },
  { id: 'limits', label: 'Limits', cats: ['room_rent', 'icu_limit', 'sub_limit', 'deductible', 'co_payment'] },
  { id: 'who', label: 'Eligibility', cats: ['eligibility'] },
  { id: 'steps', label: 'Claim steps', cats: ['claim_requirement'] },
]

// ─── Overview: KPIs, rules, details ───────────────────────────────────────────

function PolicyView({
  result,
  onEstimate,
  onEvidence,
}: {
  result: PolicyAnalysisResult
  onEstimate: () => void
  onEvidence: (rule: PolicyRule) => void
}) {
  const { overview } = result
  const inGroup = (g: RuleGroup) => result.rules.filter((r) => RULE_GROUPS.find((x) => x.id === g)!.cats.includes(r.category))
  const [group, setGroup] = useState<RuleGroup>(
    () => RULE_GROUPS.find((g) => result.rules.some((r) => g.cats.includes(r.category)))?.id ?? 'covered',
  )
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const rules = inGroup(group).filter(
    (r) => !q || r.rule_name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || r.value.toLowerCase().includes(q),
  )

  const kpis: { label: string; value: string; sub: string; group?: RuleGroup }[] = [
    { label: 'Sum insured', value: overview.sum_insured || 'Not found', sub: overview.policy_type || 'Base cover' },
    { label: 'Covered items', value: String(inGroup('covered').length), sub: `${inGroup('not').length} ${inGroup('not').length === 1 ? 'exclusion' : 'exclusions'}`, group: 'covered' },
    { label: 'Waiting periods', value: String(inGroup('waiting').length), sub: 'Check before admission', group: 'waiting' },
    { label: 'Limits and co-pay', value: String(inGroup('limits').length), sub: 'Room, sub-limits, deductibles', group: 'limits' },
  ]

  return (
    <div className="db-stack">
      {result.extraction_report && <ExtractionQuality report={result.extraction_report} pages={result.pages} />}

      {result.scanned_pdf_warning && !result.extraction_report && (
        <p className="db-banner">
          <Warning size={18} weight="bold" aria-hidden /> Scanned PDF. Some text may be missing.
        </p>
      )}

      <div className="db-kpis">
        {kpis.map((k) =>
          k.group ? (
            <button
              key={k.label}
              type="button"
              className="db-kpi db-kpi-btn"
              data-active={group === k.group || undefined}
              onClick={() => setGroup(k.group!)}
            >
              <span className="db-kpi-label">{k.label}</span>
              <span className="db-kpi-value">{k.value}</span>
              <span className="db-kpi-sub">{k.sub}</span>
            </button>
          ) : (
            <div key={k.label} className="db-kpi">
              <span className="db-kpi-label">{k.label}</span>
              <span className="db-kpi-value db-kpi-money">{k.value}</span>
              <span className="db-kpi-sub">{k.sub}</span>
            </div>
          ),
        )}
      </div>

      <div className="db-grid">
        <section className="db-card" aria-label="Policy rules">
          <div className="db-card-head">
            <div>
              <h2 className="db-card-title">Policy rules</h2>
              <p className="db-card-sub">{result.rules.length} rules read from your policy, each with its page.</p>
            </div>
            <label className="db-search">
              <MagnifyingGlass size={16} weight="bold" aria-hidden />
              <input placeholder="Search rules" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search rules" />
            </label>
          </div>

          <div className="db-tabs" role="tablist" aria-label="Rule type">
            {RULE_GROUPS.filter((g) => inGroup(g.id).length > 0).map((g) => (
              <button key={g.id} type="button" role="tab" aria-selected={group === g.id} className="db-tab" onClick={() => setGroup(g.id)}>
                {g.label}
                <span>{inGroup(g.id).length}</span>
              </button>
            ))}
          </div>

          {rules.length === 0 ? (
            <p className="db-empty">Nothing here for this policy.</p>
          ) : (
            <div className="rules-list">
              {rules.map((rule, i) => (
                <RuleCard key={rule.id} rule={rule} onEvidence={onEvidence} index={i} />
              ))}
            </div>
          )}
        </section>

        <aside className="db-rail">
          <section className="db-card db-cta">
            <h2 className="db-card-title">Estimate your cost</h2>
            <p className="db-card-sub">Pick a treatment and see what the insurer pays and what you pay.</p>
            <button type="button" className="db-btn db-btn-primary" onClick={onEstimate}>
              Open the estimator <ArrowRight size={16} weight="bold" aria-hidden />
            </button>
          </section>

          <section className="db-card">
            <h2 className="db-card-title">Policy details</h2>
            <dl className="db-dl">
              <div>
                <dt>Insurer</dt>
                <dd>{overview.insurer || 'Not found'}</dd>
              </div>
              <div>
                <dt>Plan</dt>
                <dd>{overview.plan_name || 'Not found'}</dd>
              </div>
              {overview.policy_type && (
                <div>
                  <dt>Type</dt>
                  <dd>{overview.policy_type}</dd>
                </div>
              )}
              <div>
                <dt>Pages read</dt>
                <dd>{result.total_pages}</dd>
              </div>
              {overview.uin && (
                <div>
                  <dt>UIN</dt>
                  <dd className="db-mono">{overview.uin}</dd>
                </div>
              )}
              <div>
                <dt>Source</dt>
                <dd>{result.cache?.hit ? 'Saved copy' : `AI read, ${(result.processing_time_ms / 1000).toFixed(0)}s`}</dd>
              </div>
            </dl>
            <p className="db-fine">Check the original wording before you decide.</p>
          </section>
        </aside>
      </div>
    </div>
  )
}

// ─── Shell: sidebar + header + content ────────────────────────────────────────

interface PolicyResultsProps {
  result: PolicyAnalysisResult
  fileName: string
  onReset: () => void
}

export function PolicyResults({ result, fileName, onReset }: PolicyResultsProps) {
  const [view, setView] = useState<View>('policy')
  const [activeRule, setActiveRule] = useState<PolicyRule | null>(null)
  const chat = useChatState() // held here so the chat survives switching tabs

  // Preflight scenario lives here so it survives tab switches and can personalise the checklist
  const [estimator, setEstimator] = useState<{
    scenario: TreatmentScenario
    preflight: CoverageResult
    userEdited: boolean
  } | null>(null)

  const checklistScenario = useMemo(() => (estimator?.userEdited ? toChecklistScenario(estimator.scenario) : null), [estimator])
  const checklistPreflight = useMemo(() => (estimator?.userEdited ? toPreflightSignals(estimator.preflight) : null), [estimator])

  const go = (v: View) => {
    setView(v)
    window.scrollTo({ top: 0 })
  }

  const current = VIEWS.find((v) => v.id === view)!
  const planName = result.overview.plan_name || fileName

  const onNavKey = (e: React.KeyboardEvent, i: number) => {
    const horizontal = window.matchMedia('(max-width: 1023px)').matches
    const nextKey = horizontal ? 'ArrowRight' : 'ArrowDown'
    const prevKey = horizontal ? 'ArrowLeft' : 'ArrowUp'
    const next = e.key === nextKey ? (i + 1) % VIEWS.length : e.key === prevKey ? (i - 1 + VIEWS.length) % VIEWS.length : null
    if (next === null) return
    e.preventDefault()
    go(VIEWS[next].id)
    ;(e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus()
  }

  return (
    <div className="db">
      <aside className="db-side">
        <div className="db-side-brand">
          <Brand size={34} />
        </div>

        <p className="db-side-label">Workspace</p>
        <nav className="db-nav" role="tablist" aria-label="Sections" aria-orientation="vertical">
          {VIEWS.map(({ id, label, Icon }, i) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              tabIndex={view === id ? 0 : -1}
              className="db-nav-item"
              onClick={() => go(id)}
              onKeyDown={(e) => onNavKey(e, i)}
            >
              <Icon size={20} weight={view === id ? 'fill' : 'regular'} aria-hidden />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="db-side-foot">
          <div className="db-plan">
            <span className="db-plan-name">{planName}</span>
            {result.overview.insurer && <span className="db-plan-sub">{result.overview.insurer}</span>}
          </div>
          <button type="button" className="db-btn db-btn-ghost" onClick={onReset}>
            <UploadSimple size={16} weight="bold" aria-hidden /> New policy
          </button>
        </div>
      </aside>

      <div className="db-main">
        <header className="db-top">
          <div className="db-top-brand">
            <Brand size={32} />
          </div>
          <div className="db-crumbs">
            <span className="db-crumb-plan">{planName}</span>
            <span aria-hidden>/</span>
            <b>{current.label}</b>
          </div>
          <div className="db-top-actions">
            <TranslateButton />
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>

        <main className={`db-content db-view-${view}`} key={view}>
          <div className="db-head">
            <h1>{current.title}</h1>
            <p>{current.sub}</p>
          </div>

          {view === 'policy' && <PolicyView result={result} onEstimate={() => go('estimate')} onEvidence={setActiveRule} />}
          {view === 'estimate' && (
            <EstimateForm
              policyResult={result}
              initialScenario={estimator?.scenario}
              onPreflightChange={(scenario, preflight, userEdited) =>
                setEstimator((prev) => ({ scenario, preflight, userEdited: userEdited || !!prev?.userEdited }))
              }
            />
          )}
          {view === 'checklist' && (
            <div className="db-stack">
              <PreparationChecklist
                result={result}
                fileName={fileName}
                scenario={checklistScenario}
                preflight={checklistPreflight}
                onOpenEstimator={() => go('estimate')}
                onViewClause={setActiveRule}
              />
            </div>
          )}
          {view === 'ask' && (
            <div className="db-card db-chat">
              <PolicyQA pages={result.pages} planTemplateId={result.plan_template_id} rules={result.rules} chat={chat} />
            </div>
          )}
          {view === 'claims' && (
            <div className="db-stack">
              <ClaimDispute pages={result.pages} />
            </div>
          )}
        </main>
      </div>

      {activeRule && <EvidenceViewer rule={activeRule} onClose={() => setActiveRule(null)} />}
    </div>
  )
}
