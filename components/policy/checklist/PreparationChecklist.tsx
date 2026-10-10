'use client'

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Cloud,
  HardDrive,
  Info,
  Loader2,
  RefreshCw,
  ShieldAlert,
  X,
} from 'lucide-react'
import type { PolicyAnalysisResult, PolicyRule } from '@/lib/types/policy'
import type { ChecklistPreflightSignals, ChecklistScenario, ChecklistStage, ChecklistTask, RiskAlert } from '@/lib/types/checklist'
import { computeProgress, computeRiskAlerts } from '@/lib/checklist/state'
import { formatDateIndian } from '@/lib/policy/normalizers'
import { useChecklist } from './useChecklist'
import { ChecklistTaskItem, Pill, REQUIREMENT_STYLE } from './ChecklistTaskItem'

const STAGES: { key: ChecklistStage; label: string; short: string }[] = [
  { key: 'before', label: 'Before hospitalization', short: 'Before' },
  { key: 'during', label: 'During treatment', short: 'During' },
  { key: 'claim', label: 'Claim submission', short: 'Claim' },
]

type Filter = 'all' | 'pending' | 'completed'

interface PreparationChecklistProps {
  result: PolicyAnalysisResult
  fileName?: string
  /** Scenario the user entered in the Preflight Estimator, if any */
  scenario: ChecklistScenario | null
  preflight: ChecklistPreflightSignals | null
  onOpenEstimator: () => void
  onViewClause: (rule: PolicyRule) => void
}

export function PreparationChecklist({
  result,
  fileName,
  scenario,
  preflight,
  onOpenEstimator,
  onViewClause,
}: PreparationChecklistProps) {
  const cl = useChecklist({ result, fileName, scenario, preflight })
  const [stage, setStage] = useState<ChecklistStage>('before')
  const [filter, setFilter] = useState<Filter>('all')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const tasks = cl.state?.tasks ?? []
  const progress = useMemo(() => computeProgress(tasks), [tasks])
  const alerts = useMemo(() => computeRiskAlerts(tasks), [tasks])
  const rulesById = useMemo(() => new Map(result.rules.map((r) => [r.id, r])), [result.rules])
  const unresolvedHigh = tasks.filter((t) => !t.stale && t.status === 'pending' && t.priority === 'high')
  const storedScenario = cl.state?.checklist.scenario ?? null

  const visible = tasks.filter(
    (t) => t.stage === stage && (filter === 'all' || t.status === filter),
  )

  const focusTask = (task: Pick<ChecklistTask, 'key' | 'stage'>) => {
    setStage(task.stage)
    setFilter('all')
    setExpanded((e) => ({ ...e, [task.key]: true }))
    requestAnimationFrame(() =>
      document.getElementById(`task-${task.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    )
  }

  // ── Missing policy data ─────────────────────────────────────────────────
  if (result.rules.length === 0) {
    return (
      <div className="tab-content">
        <EmptyCard
          title="No policy terms to build a checklist from"
          body="The analysis did not extract any policy rules, so a personalised checklist cannot be generated. Try re-uploading a clearer copy of the policy."
        />
      </div>
    )
  }

  if (cl.status === 'loading') {
    return (
      <div className="tab-content">
        <div className="flex items-center gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-6 text-sm text-[var(--muted)]">
          <Loader2 size={18} className="animate-spin text-[var(--brand)]" />
          Loading your checklist…
        </div>
      </div>
    )
  }

  if (cl.status === 'error' || !cl.state) {
    return (
      <div className="tab-content">
        <div className="rounded-[var(--radius)] border bg-[var(--card)] p-5" style={{ borderColor: 'color-mix(in srgb, var(--deny) 40%, var(--border))' }}>
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
            <AlertTriangle size={16} className="text-[var(--deny)]" /> Could not load your checklist
          </div>
          <p className="mt-1 text-[13px] text-[var(--muted)]">{cl.error}</p>
          <button type="button" className="button-primary mt-4" onClick={() => void cl.retry()}>
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="tab-content">
      {/* Header */}
      <div className="section-header flex-wrap">
        <div className="flex items-start gap-3">
          <div className="icon-box tone-green shrink-0">
            <ClipboardCheck size={16} />
          </div>
          <div>
            <h2 className="section-title">Hospitalization checklist</h2>
            <p className="section-sub">
              Built from the clauses extracted from {result.overview.plan_name || fileName || 'your policy'}. Tasks cite the policy page they come from.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill
            color={cl.mode === 'cloud' ? 'var(--ok)' : 'var(--warn)'}
            title={cl.mode === 'cloud' ? 'Progress is saved to your account' : cl.localReason ?? undefined}
          >
            {cl.mode === 'cloud' ? <Cloud size={11} /> : <HardDrive size={11} />}
            {cl.mode === 'cloud' ? 'Saved to your account' : 'Saved on this device only'}
          </Pill>
          <button
            type="button"
            onClick={() => void cl.regenerate(scenario ?? undefined)}
            disabled={cl.regenerating}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border2)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--text)] hover:border-[var(--border3)] disabled:opacity-50"
            title="Rebuild tasks from the current policy data and scenario. Completed tasks, dates and documents are kept."
          >
            <RefreshCw size={13} className={cl.regenerating ? 'animate-spin' : ''} /> Update from policy
          </button>
        </div>
      </div>

      {/* Notices */}
      {cl.notice && (
        <div className="flex items-start justify-between gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3 text-[13px] text-[var(--text)]" role="status">
          <span>{cl.notice}</span>
          <button type="button" aria-label="Dismiss" onClick={cl.clearNotice} className="text-[var(--subtle)] hover:text-[var(--text)]">
            <X size={14} />
          </button>
        </div>
      )}
      {cl.mode === 'local' && (
        <Banner tone="var(--warn)" icon={<HardDrive size={15} />}>
          <strong>Progress is stored in this browser only.</strong> {cl.localReason} Document attachments need a signed-in account with checklist storage set up.
        </Banner>
      )}
      <ScenarioBanner
        scenario={scenario}
        storedScenario={storedScenario}
        changed={cl.scenarioChanged}
        updating={cl.regenerating}
        onApply={() => void cl.regenerate(scenario)}
        onOpenEstimator={onOpenEstimator}
      />

      {/* Progress */}
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--subtle)]">Overall progress</div>
            <div className="mt-1 text-2xl font-bold text-[var(--text)]">
              {progress.completed} <span className="text-base font-medium text-[var(--subtle)]">of {progress.total} tasks</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Pill color={progress.unresolvedHigh ? 'var(--deny)' : 'var(--ok)'}>
              {progress.unresolvedHigh} high-priority open
            </Pill>
            <Pill color={progress.missingDocuments ? 'var(--warn)' : 'var(--ok)'}>
              {progress.missingDocuments} document{progress.missingDocuments === 1 ? '' : 's'} missing
            </Pill>
          </div>
        </div>
        <div
          className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-[var(--sunk)]"
          role="progressbar"
          aria-label="Checklist completion"
          aria-valuenow={progress.percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full rounded-full bg-[var(--ok)] transition-all duration-500" style={{ width: `${progress.percent}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
          {STAGES.map((s) => (
            <div key={s.key} className="text-[var(--subtle)]">
              <span className="hidden sm:inline">{s.label}</span>
              <span className="sm:hidden">{s.short}</span>
              <div className="font-semibold text-[var(--text)]">
                {progress.byStage[s.key].completed}/{progress.byStage[s.key].total}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Risk alerts */}
      {alerts.length > 0 && (
        <section aria-labelledby="risk-alerts-heading" className="space-y-2">
          <h3 id="risk-alerts-heading" className="section-title flex items-center gap-2">
            <ShieldAlert size={15} className="text-[var(--deny)]" /> Risk alerts
            <span className="text-[12px] font-normal text-[var(--subtle)]">({alerts.length})</span>
          </h3>
          <div className="grid gap-2 lg:grid-cols-2">
            {alerts.map((a) => (
              <RiskAlertCard
                key={a.id}
                alert={a}
                onOpen={() => {
                  const t = tasks.find((x) => x.key === a.taskKeys[0])
                  if (t) focusTask(t)
                }}
              />
            ))}
          </div>
        </section>
      )}

      {/* Unresolved high priority */}
      {unresolvedHigh.length > 0 ? (
        <section
          aria-labelledby="high-priority-heading"
          className="rounded-[var(--radius)] border p-4"
          style={{ borderColor: 'color-mix(in srgb, var(--deny) 35%, var(--border))', background: 'color-mix(in srgb, var(--deny) 4%, var(--card))' }}
        >
          <h3 id="high-priority-heading" className="section-title flex items-center gap-2">
            <AlertTriangle size={15} className="text-[var(--deny)]" /> Unresolved high-priority tasks
          </h3>
          <ul className="mt-2 divide-y divide-[var(--border)]">
            {unresolvedHigh.map((t) => (
              <li key={t.key}>
                <button
                  type="button"
                  onClick={() => focusTask(t)}
                  className="flex w-full items-center justify-between gap-3 py-2 text-left text-[13px] text-[var(--text)] hover:text-[var(--brand)]"
                >
                  <span className="min-w-0">
                    <span className="mr-2 text-[11px] uppercase tracking-wide text-[var(--subtle)]">
                      {STAGES.find((s) => s.key === t.stage)?.short}
                    </span>
                    {t.title}
                  </span>
                  <ArrowRight size={14} className="shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        progress.total > 0 && (
          <Banner tone="var(--ok)" icon={<CheckCircle2 size={15} />}>
            All high-priority tasks are complete.
          </Banner>
        )
      )}

      {/* Stage tabs + filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Checklist stages" className="flex overflow-x-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-1">
          {STAGES.map((s) => {
            const active = s.key === stage
            const counts = progress.byStage[s.key]
            return (
              <button
                key={s.key}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setStage(s.key)}
                className="flex-1 whitespace-nowrap rounded-[var(--radius-sm)] px-3 py-1.5 text-[13px] font-medium transition-colors"
                style={{
                  background: active ? 'var(--card)' : 'transparent',
                  color: active ? 'var(--text)' : 'var(--subtle)',
                  boxShadow: active ? '0 0 0 1px var(--border2)' : 'none',
                }}
              >
                <span className="hidden sm:inline">{s.label}</span>
                <span className="sm:hidden">{s.short}</span>
                <span className="ml-1.5 text-[11px] text-[var(--subtle)]">
                  {counts.completed}/{counts.total}
                </span>
              </button>
            )
          })}
        </div>
        <div className="flex gap-1" role="group" aria-label="Filter tasks">
          {(['all', 'pending', 'completed'] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className="rounded-full border px-3 py-1 text-[12px] font-medium capitalize transition-colors"
              style={{
                borderColor: filter === f ? 'var(--brand)' : 'var(--border2)',
                color: filter === f ? 'var(--brand)' : 'var(--muted)',
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Task list */}
      {visible.length === 0 ? (
        <EmptyCard
          title={filter === 'completed' ? 'No completed tasks here yet' : filter === 'pending' ? 'Nothing pending in this stage' : 'No tasks for this stage'}
          body={
            filter === 'pending'
              ? 'Every task in this stage is done.'
              : filter === 'completed'
                ? 'Tick a task once you have done it — you can reopen it any time.'
                : 'Your policy data did not produce tasks for this stage.'
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((task) => (
            <ChecklistTaskItem
              key={task.key}
              task={task}
              expanded={!!expanded[task.key]}
              onToggleExpanded={() => setExpanded((e) => ({ ...e, [task.key]: !e[task.key] }))}
              onSetStatus={(s) => void cl.updateTask(task.key, { status: s })}
              onSetDueDate={(d) => void cl.updateTask(task.key, { dueDate: d })}
              onUpload={(file) => void cl.uploadAttachment(task.key, file)}
              onDeleteAttachment={(id) => void cl.deleteAttachment(task.key, id)}
              onViewClause={onViewClause}
              rulesById={rulesById}
              busy={!!cl.busy[task.key]}
              attachmentsEnabled={cl.mode === 'cloud'}
              attachmentsDisabledReason="Sign in with checklist storage enabled to attach documents."
            />
          ))}
        </ul>
      )}

      {/* Legend */}
      <div className="flex flex-col gap-1.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3 text-[12px] text-[var(--muted)]">
        <div className="flex items-center gap-1.5 font-semibold text-[var(--text)]">
          <Info size={13} /> How to read these tasks
        </div>
        {Object.values(REQUIREMENT_STYLE).map((r) => (
          <div key={r.label} className="flex flex-wrap items-center gap-2">
            <Pill color={r.color}>{r.label}</Pill>
            <span>{r.hint}</span>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <Pill color="var(--warn)">Verify</Pill>
          <span>The supporting clause was low-confidence or could not be matched to the policy text — confirm it with your insurer/TPA.</span>
        </div>
        <p className="text-[var(--subtle)]">
          This checklist helps you prepare; it is not a guarantee of claim approval. Your insurer’s policy wording, endorsements and the TPA’s instructions take precedence.
        </p>
      </div>
    </div>
  )
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function Banner({ tone, icon, children }: { tone: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      className="flex items-start gap-2.5 rounded-[var(--radius)] border p-3 text-[13px] text-[var(--text)]"
      style={{ borderColor: `color-mix(in srgb, ${tone} 35%, var(--border))`, background: `color-mix(in srgb, ${tone} 6%, var(--card))` }}
    >
      <span className="mt-0.5 shrink-0" style={{ color: tone }}>
        {icon}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function EmptyCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-dashed border-[var(--border2)] bg-[var(--card)] p-6 text-center">
      <div className="text-sm font-semibold text-[var(--text)]">{title}</div>
      <p className="mx-auto mt-1 max-w-md text-[13px] text-[var(--subtle)]">{body}</p>
    </div>
  )
}

function describeScenario(s: ChecklistScenario): string {
  return [
    s.treatment,
    s.proposedAdmissionDate ? `admission ${formatDateIndian(s.proposedAdmissionDate)}` : null,
    s.stayDurationDays ? `${s.stayDurationDays}-day stay` : null,
    s.isNetworkHospital === true ? 'network hospital' : s.isNetworkHospital === false ? 'non-network hospital' : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

function ScenarioBanner({
  scenario,
  storedScenario,
  changed,
  updating,
  onApply,
  onOpenEstimator,
}: {
  scenario: ChecklistScenario | null
  storedScenario: ChecklistScenario | null
  changed: boolean
  updating: boolean
  onApply: () => void
  onOpenEstimator: () => void
}) {
  if (changed && scenario) {
    return (
      <Banner tone="var(--info)" icon={<RefreshCw size={15} />}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            Your Preflight scenario changed (<strong>{describeScenario(scenario)}</strong>). Update the checklist to match? Completed tasks and documents are kept.
          </span>
          <button type="button" className="button-primary" onClick={onApply} disabled={updating}>
            {updating ? 'Updating…' : 'Update checklist'}
          </button>
        </div>
      </Banner>
    )
  }
  if (storedScenario?.treatment) {
    return (
      <Banner tone="var(--ok)" icon={<ClipboardCheck size={15} />}>
        Personalised for <strong>{describeScenario(storedScenario)}</strong>.{' '}
        <button type="button" className="font-medium text-[var(--brand)] hover:underline" onClick={onOpenEstimator}>
          Change scenario
        </button>
      </Banner>
    )
  }
  return (
    <Banner tone="var(--info)" icon={<Info size={15} />}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          These tasks come from your policy only. Add your treatment, admission date and room choice in the Preflight Estimator to get waiting-period, sub-limit and deadline tasks for your case.
        </span>
        <button type="button" className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--brand)] hover:underline" onClick={onOpenEstimator}>
          Open Preflight Estimator <ArrowRight size={13} />
        </button>
      </div>
    </Banner>
  )
}

function RiskAlertCard({ alert, onOpen }: { alert: RiskAlert; onOpen: () => void }) {
  const tone = alert.severity === 'high' ? 'var(--deny)' : 'var(--warn)'
  const pages = Array.from(new Set(alert.references.map((r) => r.page).filter((p): p is number => p !== null)))
  return (
    <div
      className="flex flex-col gap-2 rounded-[var(--radius)] border bg-[var(--card)] p-3.5"
      style={{ borderColor: `color-mix(in srgb, ${tone} 35%, var(--border))` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text)]">
          <AlertTriangle size={14} style={{ color: tone }} className="shrink-0" />
          {alert.title}
        </div>
        <Pill color={REQUIREMENT_STYLE[alert.requirementLevel].color}>{REQUIREMENT_STYLE[alert.requirementLevel].label}</Pill>
      </div>
      <p className="text-[12.5px] leading-relaxed text-[var(--muted)]">{alert.risk}</p>
      <p className="text-[12.5px] leading-relaxed text-[var(--text)]">
        <span className="font-semibold">Next step: </span>
        {alert.nextAction}
      </p>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-[var(--subtle)]">
        <span className="font-mono">{pages.length ? `Policy page ${pages.join(', ')}` : 'No specific clause'}</span>
        <button type="button" onClick={onOpen} className="inline-flex items-center gap-1 font-medium text-[var(--brand)] hover:underline">
          Go to task <ArrowRight size={12} />
        </button>
      </div>
    </div>
  )
}
