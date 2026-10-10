'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PolicyAnalysisResult } from '@/lib/types/policy'
import type { CoverageResult, TreatmentScenario } from '@/lib/types/estimate'
import type {
  ChecklistAttachment,
  ChecklistPreflightSignals,
  ChecklistScenario,
  ChecklistState,
  ChecklistTask,
} from '@/lib/types/checklist'
import { generateChecklist, type ChecklistGenerationInput } from '@/lib/checklist/generator'
import { applyLocalMerge } from '@/lib/checklist/state'
import { getPolicyKey } from '@/lib/checklist/policyKey'

export type ChecklistMode = 'cloud' | 'local'

/** Only the fields the checklist uses — and only when the user actually entered a scenario */
export function toChecklistScenario(s: TreatmentScenario): ChecklistScenario {
  return {
    treatment: s.treatment,
    age: s.age,
    roomType: s.roomType,
    stayDurationDays: s.stayDurationDays,
    policyStartDate: s.policyStartDate || undefined,
    proposedAdmissionDate: s.proposedAdmissionDate || undefined,
    isNetworkHospital: s.isNetworkHospital,
    declaredPED: s.declaredPED?.length ? s.declaredPED : undefined,
  }
}

export function toPreflightSignals(r: CoverageResult | null | undefined): ChecklistPreflightSignals | null {
  if (!r) return null
  return {
    status: r.status,
    waitingPeriodDetails: r.waitingPeriodDetails
      ? {
          requiredMonths: r.waitingPeriodDetails.requiredMonths,
          completionDate: r.waitingPeriodDetails.completionDate,
          isActive: r.waitingPeriodDetails.isActive,
          pageNumber: r.waitingPeriodDetails.pageNumber,
          ruleEvidence: r.waitingPeriodDetails.ruleEvidence,
        }
      : undefined,
    ledger: r.ledger.map((l) => ({
      ruleId: l.ruleId,
      ruleName: l.ruleName,
      ruleType: l.ruleType,
      deductionAmount: l.deductionAmount,
      impact: l.impact,
      evidence: l.evidence,
    })),
  }
}

const sameScenario = (a?: ChecklistScenario | null, b?: ChecklistScenario | null) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

const LOCAL_PREFIX = 'claimlens:checklist:'

function readLocal(policyKey: string): ChecklistState | null {
  try {
    const raw = window.localStorage.getItem(LOCAL_PREFIX + policyKey)
    return raw ? (JSON.parse(raw) as ChecklistState) : null
  } catch {
    return null
  }
}

function writeLocal(state: ChecklistState) {
  try {
    window.localStorage.setItem(LOCAL_PREFIX + state.checklist.policyKey, JSON.stringify(state))
  } catch {
    /* storage full or blocked — progress stays in memory for this visit */
  }
}

async function api<T>(input: string, init?: RequestInit): Promise<{ ok: boolean; status: number; code?: string; data?: T; error?: string }> {
  const res = await fetch(input, { ...init, credentials: 'same-origin' })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok && json.success !== false, status: res.status, code: json.code, data: json.data, error: json.error }
}

export interface UseChecklistOptions {
  result: PolicyAnalysisResult
  fileName?: string
  /** Scenario the user entered in the Preflight Estimator (null if none) */
  scenario: ChecklistScenario | null
  preflight: ChecklistPreflightSignals | null
}

export function useChecklist({ result, fileName, scenario, preflight }: UseChecklistOptions) {
  const policyKey = useMemo(() => getPolicyKey(result), [result])
  const [state, setState] = useState<ChecklistState | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [mode, setMode] = useState<ChecklistMode>('cloud')
  const [localReason, setLocalReason] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [regenerating, setRegenerating] = useState(false)
  const stateRef = useRef<ChecklistState | null>(null)
  stateRef.current = state

  const generation = useMemo<Omit<ChecklistGenerationInput, 'scenario'>>(
    () => ({
      rules: result.rules,
      compiledRules: result.compiled_rules,
      overview: result.overview,
      preflight,
      extractionReport: result.extraction_report
        ? {
            pages_needing_rescan: result.extraction_report.pages_needing_rescan,
            pages_with_ambiguous_amounts: result.extraction_report.pages_with_ambiguous_amounts,
          }
        : null,
    }),
    [result, preflight],
  )

  const buildLocal = useCallback(
    (previous: ChecklistState | null, useScenario: ChecklistScenario | null): ChecklistState => {
      const now = new Date().toISOString()
      const tasks = applyLocalMerge(generateChecklist({ ...generation, scenario: useScenario }), previous?.tasks ?? [])
      return {
        checklist: {
          id: previous?.checklist.id ?? `local-${policyKey}`,
          policyKey,
          insurer: result.overview.insurer,
          planName: result.overview.plan_name,
          fileName: fileName ?? null,
          scenario: useScenario,
          createdAt: previous?.checklist.createdAt ?? now,
          updatedAt: now,
        },
        tasks,
      }
    },
    [generation, policyKey, result.overview, fileName],
  )

  const enterLocalMode = useCallback(
    (reason: string) => {
      setMode('local')
      setLocalReason(reason)
      const saved = readLocal(policyKey)
      const next = saved ?? buildLocal(null, scenario)
      if (!saved) writeLocal(next)
      setState(next)
      setStatus('ready')
    },
    [policyKey, buildLocal, scenario],
  )

  const sync = useCallback(
    async (useScenario: ChecklistScenario | null | undefined) => {
      const res = await api<ChecklistState>('/api/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policyKey,
          insurer: result.overview.insurer,
          planName: result.overview.plan_name,
          fileName,
          scenario: useScenario,
          generation,
        }),
      })
      return res
    },
    [policyKey, result.overview, fileName, generation],
  )

  const load = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const res = await api<ChecklistState>(`/api/checklist?policyKey=${encodeURIComponent(policyKey)}`)
      if (res.ok && res.data) {
        setMode('cloud')
        setState(res.data)
        setStatus('ready')
        return
      }
      if (res.status === 401 || res.status === 503) {
        enterLocalMode(res.error || 'Checklist storage is unavailable.')
        return
      }
      if (res.status === 404) {
        const created = await sync(scenario)
        if (created.ok && created.data) {
          setMode('cloud')
          setState(created.data)
          setStatus('ready')
          return
        }
        if (created.status === 401 || created.status === 503) {
          enterLocalMode(created.error || 'Checklist storage is unavailable.')
          return
        }
        throw new Error(created.error || 'Could not create the checklist.')
      }
      throw new Error(res.error || `Could not load the checklist (${res.status}).`)
    } catch (err: any) {
      setError(err?.message || 'Could not load the checklist.')
      setStatus('error')
    }
    // scenario intentionally excluded: a later scenario change is offered as an update, not auto-applied
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policyKey, enterLocalMode, sync])

  useEffect(() => {
    void load()
  }, [load])

  /** Re-run generation with the current policy data and scenario, keeping progress */
  const regenerate = useCallback(
    async (useScenario: ChecklistScenario | null | undefined) => {
      setRegenerating(true)
      setError(null)
      try {
        if (mode === 'local') {
          const next = buildLocal(stateRef.current, useScenario === undefined ? stateRef.current?.checklist.scenario ?? null : useScenario)
          writeLocal(next)
          setState(next)
          return
        }
        const res = await sync(useScenario)
        if (!res.ok || !res.data) throw new Error(res.error || 'Could not update the checklist.')
        setState(res.data)
        setNotice('Checklist updated — your progress and documents were kept.')
      } catch (err: any) {
        setNotice(err?.message || 'Could not update the checklist.')
      } finally {
        setRegenerating(false)
      }
    },
    [mode, buildLocal, sync],
  )

  const patchTaskLocally = (key: string, patch: Partial<ChecklistTask>) => {
    setState((prev) => {
      if (!prev) return prev
      const next = { ...prev, tasks: prev.tasks.map((t) => (t.key === key ? { ...t, ...patch } : t)) }
      if (mode === 'local') writeLocal(next)
      return next
    })
  }

  const updateTask = useCallback(
    async (key: string, patch: { status?: ChecklistTask['status']; dueDate?: string | null }) => {
      const current = stateRef.current
      const before = current?.tasks.find((t) => t.key === key)
      if (!current || !before) return
      const optimistic: Partial<ChecklistTask> = {}
      if (patch.status) {
        optimistic.status = patch.status
        optimistic.completedAt = patch.status === 'completed' ? new Date().toISOString() : null
      }
      if (patch.dueDate !== undefined) optimistic.dueDate = patch.dueDate
      patchTaskLocally(key, optimistic)
      if (mode === 'local') return

      setBusy((b) => ({ ...b, [key]: true }))
      try {
        const res = await api<ChecklistTask>('/api/checklist/tasks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checklistId: current.checklist.id, taskKey: key, ...patch }),
        })
        if (!res.ok || !res.data) throw new Error(res.error || 'Could not save the change.')
        patchTaskLocally(key, { status: res.data.status, dueDate: res.data.dueDate, completedAt: res.data.completedAt })
      } catch (err: any) {
        patchTaskLocally(key, { status: before.status, dueDate: before.dueDate, completedAt: before.completedAt })
        setNotice(err?.message || 'Could not save the change — please try again.')
      } finally {
        setBusy((b) => ({ ...b, [key]: false }))
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode],
  )

  const uploadAttachment = useCallback(
    async (key: string, file: File) => {
      const current = stateRef.current
      if (!current || mode === 'local') return
      setBusy((b) => ({ ...b, [key]: true }))
      try {
        const form = new FormData()
        form.append('checklistId', current.checklist.id)
        form.append('taskKey', key)
        form.append('file', file)
        const res = await api<ChecklistAttachment>('/api/checklist/attachments', { method: 'POST', body: form })
        if (!res.ok || !res.data) throw new Error(res.error || 'Upload failed.')
        const added = res.data
        setState((prev) =>
          prev && {
            ...prev,
            tasks: prev.tasks.map((t) => (t.key === key ? { ...t, attachments: [...t.attachments, added] } : t)),
          },
        )
      } catch (err: any) {
        setNotice(err?.message || 'Upload failed — please try again.')
      } finally {
        setBusy((b) => ({ ...b, [key]: false }))
      }
    },
    [mode],
  )

  const deleteAttachment = useCallback(
    async (key: string, attachmentId: string) => {
      setBusy((b) => ({ ...b, [key]: true }))
      try {
        const res = await api(`/api/checklist/attachments/${attachmentId}`, { method: 'DELETE' })
        if (!res.ok) throw new Error(res.error || 'Could not remove the file.')
        setState((prev) =>
          prev && {
            ...prev,
            tasks: prev.tasks.map((t) =>
              t.key === key ? { ...t, attachments: t.attachments.filter((a) => a.id !== attachmentId) } : t,
            ),
          },
        )
      } catch (err: any) {
        setNotice(err?.message || 'Could not remove the file.')
      } finally {
        setBusy((b) => ({ ...b, [key]: false }))
      }
    },
    [],
  )

  const scenarioChanged = !!state && !!scenario && !sameScenario(scenario, state.checklist.scenario)

  return {
    policyKey,
    state,
    status,
    mode,
    localReason,
    error,
    notice,
    clearNotice: () => setNotice(null),
    busy,
    regenerating,
    scenarioChanged,
    retry: load,
    regenerate,
    updateTask,
    uploadAttachment,
    deleteAttachment,
  }
}
