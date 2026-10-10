'use client'

import type { PolicyAnalysisResult, PolicyCategory, PolicyRule } from '@/lib/types/policy'
import { useMemo, useState } from 'react'
import {
  ArrowRight,
  Calculator,
  ChatCircleDots,
  ListChecks,
  MagnifyingGlass,
  Receipt,
  Scales,
  ShieldCheck,
  UploadSimple,
  Warning,
} from '@phosphor-icons/react'
import { RuleCard, EvidenceViewer } from './shared'
import { PolicyQA, useChatState } from './PolicyQA'
import { EstimateForm } from './EstimateForm'
import { ClaimDispute } from './ClaimDispute'
import { BillAudit } from './BillAudit'
import { Brand } from '../ui/Brand'
import { ThemeToggle } from '../ui/ThemeToggle'
import { UserMenu } from '../ui/UserMenu'
import { TranslateButton } from '../ui/TranslateButton'
import { NotificationBell } from '../notifications/NotificationBell'
import { getPolicyKey } from '@/lib/checklist/policyKey'
import { ExtractionQuality } from './ExtractionQuality'
import { PreparationChecklist } from './checklist/PreparationChecklist'
import { toChecklistScenario, toPreflightSignals } from './checklist/useChecklist'
import type { CoverageResult, TreatmentScenario } from '@/lib/types/estimate'

// ─── Views & Navigation ───────────────────────────────────────────────────────

type View = 'policy' | 'estimate' | 'checklist' | 'bill_audit' | 'ask' | 'claims'

const VIEWS: { id: View; label: string; Icon: any }[] = [
  { id: 'policy', label: 'Policy', Icon: ShieldCheck },
  { id: 'estimate', label: 'Estimate', Icon: Calculator },
  { id: 'checklist', label: 'Checklist', Icon: ListChecks },
  { id: 'bill_audit', label: 'Bill Audit', Icon: Receipt },
  { id: 'ask', label: 'Ask & Voice', Icon: ChatCircleDots },
  { id: 'claims', label: 'Dispute', Icon: Scales },
]

type RuleGroup = 'covered' | 'not' | 'waiting' | 'limits' | 'who' | 'steps'

const RULE_GROUPS: { id: RuleGroup; label: string; cats: PolicyCategory[] }[] = [
  { id: 'covered', label: 'Covered', cats: ['coverage'] },
  { id: 'not', label: 'Not covered', cats: ['exclusion'] },
  { id: 'waiting', label: 'Waiting', cats: ['waiting_period'] },
  { id: 'limits', label: 'Limits', cats: ['room_rent', 'icu_limit', 'sub_limit', 'deductible', 'co_payment'] },
  { id: 'who', label: 'Who qualifies', cats: ['eligibility'] },
  { id: 'steps', label: 'Claim steps', cats: ['claim_requirement'] },
]

// ─── Policy view: the facts, one big action, then the rules ───────────────────

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
  const [group, setGroup] = useState<RuleGroup>(
    () => RULE_GROUPS.find((g) => result.rules.some((r) => g.cats.includes(r.category)))?.id ?? 'covered',
  )
  const [query, setQuery] = useState('')

  const inGroup = (g: RuleGroup) => result.rules.filter((r) => RULE_GROUPS.find((x) => x.id === g)!.cats.includes(r.category))
  const q = query.trim().toLowerCase()
  const rules = inGroup(group).filter(
    (r) => !q || r.rule_name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || r.value.toLowerCase().includes(q),
  )

  return (
    <div className="sx-stack">
      {/* OCR & Document Quality Report (if available) */}
      {result.extraction_report && (
        <ExtractionQuality report={result.extraction_report} pages={result.pages} />
      )}

      {result.scanned_pdf_warning && !result.extraction_report && (
        <p className="sx-note sx-note-warn">
          <Warning size={18} weight="bold" aria-hidden /> Scanned PDF. Some text may be missing.
        </p>
      )}

      <header className="sx-hero">
        <h1 className="sx-title">{overview.plan_name || 'Your policy'}</h1>
        {overview.insurer && <p className="sx-sub">{overview.insurer}</p>}
        <dl className="sx-facts">
          <div className="sx-fact sx-fact-lead">
            <dt>Sum insured</dt>
            <dd className="sx-figure">{overview.sum_insured || 'Not found'}</dd>
          </div>
          {overview.policy_type && (
            <div className="sx-fact">
              <dt>Type</dt>
              <dd>{overview.policy_type}</dd>
            </div>
          )}
          <div className="sx-fact">
            <dt>Read</dt>
            <dd>{result.total_pages} pages</dd>
          </div>
          {overview.uin && (
            <div className="sx-fact">
              <dt>UIN</dt>
              <dd className="sx-uin">{overview.uin}</dd>
            </div>
          )}
        </dl>
      </header>

      <button type="button" className="sx-cta" onClick={onEstimate}>
        <span className="sx-cta-icon" aria-hidden>
          <Calculator size={26} weight="bold" />
        </span>
        <span className="sx-cta-text">
          <strong>What will I pay?</strong>
          <span>Plan a hospital stay</span>
        </span>
        <ArrowRight size={22} weight="bold" aria-hidden />
      </button>

      <section className="sx-rules" aria-label="Your policy rules">
        <h2 className="sx-h2">Your rules</h2>
        <div className="sx-chips" role="tablist" aria-label="Rule type">
          {RULE_GROUPS.filter((g) => inGroup(g.id).length > 0).map((g) => (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={group === g.id}
              className="sx-chip"
              onClick={() => setGroup(g.id)}
            >
              {g.label}
              <b>{inGroup(g.id).length}</b>
            </button>
          ))}
        </div>

        {inGroup(group).length > 5 && (
          <label className="sx-search">
            <MagnifyingGlass size={18} weight="bold" aria-hidden />
            <input placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search rules" />
          </label>
        )}

        {rules.length === 0 ? (
          <p className="sx-empty">Nothing here for this policy.</p>
        ) : (
          <div className="rules-list">
            {rules.map((rule, i) => (
              <RuleCard key={rule.id} rule={rule} onEvidence={onEvidence} index={i} />
            ))}
          </div>
        )}
      </section>

      <p className="sx-foot">
        {result.cache?.hit ? 'Loaded from a saved copy of this policy.' : `Read by AI in ${(result.processing_time_ms / 1000).toFixed(0)}s.`} Check the original wording before you decide.
      </p>
    </div>
  )
}

// ─── Claims view: Dispute helper ──────────────────────────────────────────────

function ClaimsView({ result }: { result: PolicyAnalysisResult }) {
  return (
    <div className="sx-stack">
      <ClaimDispute pages={result.pages} />
    </div>
  )
}

// ─── Shell ────────────────────────────────────────────────────────────────────

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

  const checklistScenario = useMemo(
    () => (estimator?.userEdited ? toChecklistScenario(estimator.scenario) : null),
    [estimator],
  )
  const checklistPreflight = useMemo(
    () => (estimator?.userEdited ? toPreflightSignals(estimator.preflight) : null),
    [estimator],
  )

  const go = (v: View) => {
    setView(v)
    window.scrollTo({ top: 0 })
  }

  // Notifications for this policy jump to the checklist (and the task, when there is one)
  const policyKey = useMemo(() => getPolicyKey(result), [result])
  const [taskFocus, setTaskFocus] = useState<{ taskKey: string; nonce: number } | null>(null)
  const openTask = (taskKey: string | null) => {
    setTaskFocus(taskKey ? { taskKey, nonce: Date.now() } : null)
    go('checklist')
  }

  const onDockKey = (e: React.KeyboardEvent, i: number) => {
    const next = e.key === 'ArrowRight' ? (i + 1) % VIEWS.length : e.key === 'ArrowLeft' ? (i - 1 + VIEWS.length) % VIEWS.length : null
    if (next === null) return
    e.preventDefault()
    go(VIEWS[next].id)
    ;(e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus()
  }

  return (
    <div className="sx-app">
      <header className="sx-top">
        <Brand size={36} />
        <div className="sx-top-actions">
          <button type="button" className="sx-new" onClick={onReset}>
            <UploadSimple size={18} weight="bold" aria-hidden />
            <span>New policy</span>
          </button>
          <TranslateButton />
          <ThemeToggle />
          <NotificationBell currentPolicyKey={policyKey} onOpenTask={openTask} />
          <UserMenu />
        </div>
      </header>

      <main className={`sx-main sx-view-${view}`} key={view}>
        {view === 'policy' && (
          <PolicyView
            result={result}
            onEstimate={() => go('estimate')}
            onEvidence={setActiveRule}
          />
        )}
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
          <div className="sx-stack">
            <PreparationChecklist
              result={result}
              fileName={fileName}
              scenario={checklistScenario}
              preflight={checklistPreflight}
              onOpenEstimator={() => go('estimate')}
              onViewClause={setActiveRule}
              focusRequest={taskFocus}
            />
          </div>
        )}
        {view === 'bill_audit' && (
          <div className="sx-stack">
            <BillAudit
              policyRules={result.rules}
              policyName={
                result.overview?.plan_name
                  ? `${result.overview.insurer || ''} ${result.overview.plan_name}`.trim()
                  : undefined
              }
            />
          </div>
        )}
        {view === 'ask' && (
          <PolicyQA
            pages={result.pages}
            planTemplateId={result.plan_template_id}
            rules={result.rules}
            chat={chat}
          />
        )}
        {view === 'claims' && <ClaimsView result={result} />}
      </main>

      <nav className="sx-dock" role="tablist" aria-label="Sections">
        {VIEWS.map(({ id, label, Icon }, i) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            tabIndex={view === id ? 0 : -1}
            className="sx-dock-btn"
            onClick={() => go(id)}
            onKeyDown={(e) => onDockKey(e, i)}
          >
            <Icon size={24} weight={view === id ? 'fill' : 'bold'} aria-hidden />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {activeRule && <EvidenceViewer rule={activeRule} onClose={() => setActiveRule(null)} />}
    </div>
  )
}
