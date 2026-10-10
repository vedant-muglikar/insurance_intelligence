/**
 * Pure checklist state logic shared by the server (database) and the
 * device-only fallback: merging regenerated tasks with saved progress,
 * smart risk alerts, and progress statistics.
 */

import type {
  ChecklistAttachment,
  ChecklistStage,
  ChecklistTask,
  ChecklistTaskDefinition,
  RiskAlert,
} from '@/lib/types/checklist'

export interface SavedTaskState {
  key: string
  status: ChecklistTask['status']
  dueDate?: string | null
  completedAt?: string | null
  hasAttachments: boolean
}

export interface MergePlan {
  /** Definitions to insert or update (progress fields untouched) */
  upserts: Array<{ definition: ChecklistTaskDefinition; stale: boolean }>
  /** Keys no longer generated and without progress — safe to delete */
  deletes: string[]
}

/**
 * Regeneration never loses user progress: tasks that are no longer produced
 * (e.g. the scenario changed) are deleted only when untouched; tasks with a
 * completed status, a due date or attachments are kept and marked stale.
 */
export function planMerge(
  generated: ChecklistTaskDefinition[],
  saved: Array<SavedTaskState & { definition?: ChecklistTaskDefinition }>,
): MergePlan {
  const generatedKeys = new Set(generated.map((t) => t.key))
  const upserts: MergePlan['upserts'] = generated.map((definition) => ({ definition, stale: false }))
  const deletes: string[] = []
  for (const s of saved) {
    if (generatedKeys.has(s.key)) continue
    const hasProgress = s.status === 'completed' || !!s.dueDate || s.hasAttachments
    if (hasProgress && s.definition) upserts.push({ definition: s.definition, stale: true })
    else deletes.push(s.key)
  }
  return { upserts, deletes }
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const
const STAGE_RANK: Record<ChecklistStage, number> = { before: 0, during: 1, claim: 2 }

export function sortTasks<T extends ChecklistTaskDefinition & { stale?: boolean }>(tasks: T[]): T[] {
  return [...tasks].sort(
    (a, b) =>
      STAGE_RANK[a.stage] - STAGE_RANK[b.stage] ||
      Number(!!a.stale) - Number(!!b.stale) ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      a.title.localeCompare(b.title),
  )
}

export function effectiveDueDate(task: Pick<ChecklistTask, 'dueDate' | 'suggestedDueDate'>): string | undefined {
  return task.dueDate || task.suggestedDueDate || undefined
}

export interface ChecklistProgress {
  total: number
  completed: number
  percent: number
  byStage: Record<ChecklistStage, { total: number; completed: number }>
  unresolvedHigh: number
  missingDocuments: number
}

export function computeProgress(tasks: ChecklistTask[]): ChecklistProgress {
  const active = tasks.filter((t) => !t.stale)
  const byStage: ChecklistProgress['byStage'] = {
    before: { total: 0, completed: 0 },
    during: { total: 0, completed: 0 },
    claim: { total: 0, completed: 0 },
  }
  for (const t of active) {
    byStage[t.stage].total++
    if (t.status === 'completed') byStage[t.stage].completed++
  }
  const completed = active.filter((t) => t.status === 'completed').length
  return {
    total: active.length,
    completed,
    percent: active.length ? Math.round((completed / active.length) * 100) : 0,
    byStage,
    unresolvedHigh: active.filter((t) => t.status === 'pending' && t.priority === 'high').length,
    missingDocuments: active.filter((t) => t.documentType && t.status === 'pending' && t.attachments.length === 0).length,
  }
}

const ALERT_TITLES: Record<NonNullable<ChecklistTaskDefinition['alertType']>, string> = {
  pre_authorization: 'Pre-authorization may be needed',
  waiting_period: 'Treatment may be subject to a waiting period',
  room_rent: 'Room-rent restriction may apply',
  exclusion_or_limit: 'Expense may be excluded or limited',
  missing_documents: 'Claim documents not yet attached',
  claim_requirement: 'Claim requirement to verify',
  verification: 'Policy terms need verification',
}

/**
 * Smart risk alerts from unresolved tasks. Wording is deliberately hedged:
 * an alert only calls something a requirement when the cited clause itself
 * uses obligation wording (requirementLevel = policy_requirement).
 */
export function computeRiskAlerts(tasks: ChecklistTask[]): RiskAlert[] {
  const pending = tasks.filter((t) => t.status === 'pending' && !t.stale)
  const alerts: RiskAlert[] = []

  for (const t of pending) {
    if (!t.alertType || t.alertType === 'missing_documents' || t.priority === 'low') continue
    const prefix =
      t.requirementLevel === 'policy_requirement'
        ? 'Your policy wording makes this a requirement. '
        : t.requirementLevel === 'policy_term'
          ? 'Based on your policy terms: '
          : 'Recommendation: '
    alerts.push({
      id: `alert:${t.key}`,
      type: t.alertType,
      severity: t.priority === 'high' ? 'high' : 'medium',
      title: t.requirementLevel === 'policy_requirement' && t.alertType === 'pre_authorization'
        ? 'Pre-authorization required by your policy'
        : ALERT_TITLES[t.alertType],
      risk: `${prefix}${t.whyItMatters}`,
      nextAction: t.recommendedAction,
      taskKeys: [t.key],
      references: t.references,
      requirementLevel: t.requirementLevel,
    })
  }

  const missingDocs = pending.filter((t) => t.documentType && t.attachments.length === 0 && t.requirementLevel !== 'recommendation')
  if (missingDocs.length > 0) {
    alerts.push({
      id: 'alert:missing-documents',
      type: 'missing_documents',
      severity: missingDocs.some((t) => t.priority === 'high') ? 'high' : 'medium',
      title: ALERT_TITLES.missing_documents,
      risk: `${missingDocs.length} document${missingDocs.length > 1 ? 's' : ''} named in your policy’s claim conditions ${missingDocs.length > 1 ? 'have' : 'has'} no copy attached yet: ${missingDocs
        .map((t) => t.title.replace(/^Collect:\s*/, ''))
        .join(', ')}.`,
      nextAction: 'Collect these from the hospital or doctor and attach them to the matching tasks so nothing is missing at claim time.',
      taskKeys: missingDocs.map((t) => t.key),
      references: missingDocs.flatMap((t) => t.references).slice(0, 4),
      requirementLevel: missingDocs.some((t) => t.requirementLevel === 'policy_requirement') ? 'policy_requirement' : 'policy_term',
    })
  }

  const unverified = pending.filter((t) => t.needsVerification && t.alertType !== 'verification')
  if (unverified.length > 0) {
    alerts.push({
      id: 'alert:unverified-terms',
      type: 'verification',
      severity: 'medium',
      title: 'Some requirements could not be verified',
      risk: `${unverified.length} task${unverified.length > 1 ? 's are' : ' is'} based on clauses that were extracted with low confidence or could not be matched to the policy text.`,
      nextAction: 'Open the flagged tasks, read the cited page in your policy, and confirm the wording with your insurer/TPA.',
      taskKeys: unverified.map((t) => t.key),
      references: [],
      requirementLevel: 'recommendation',
    })
  }

  const rank = (a: RiskAlert) => (a.severity === 'high' ? 0 : 1)
  return alerts.sort((a, b) => rank(a) - rank(b))
}

/** Device-only fallback: combine definitions with saved progress */
export function applyLocalMerge(generated: ChecklistTaskDefinition[], previous: ChecklistTask[]): ChecklistTask[] {
  const byKey = new Map(previous.map((t) => [t.key, t]))
  const plan = planMerge(
    generated,
    previous.map((t) => ({
      key: t.key,
      status: t.status,
      dueDate: t.dueDate,
      completedAt: t.completedAt,
      hasAttachments: t.attachments.length > 0,
      definition: t,
    })),
  )
  return sortTasks(
    plan.upserts.map(({ definition, stale }) => {
      const prev = byKey.get(definition.key)
      return {
        ...stripState(definition),
        status: prev?.status ?? 'pending',
        dueDate: prev?.dueDate ?? null,
        completedAt: prev?.completedAt ?? null,
        stale,
        attachments: prev?.attachments ?? ([] as ChecklistAttachment[]),
      }
    }),
  )
}

/** Remove progress fields so a stored task can be reused as a pure definition */
export function stripState(t: ChecklistTaskDefinition & Partial<ChecklistTask>): ChecklistTaskDefinition {
  const { status, dueDate, completedAt, stale, attachments, ...definition } = t as ChecklistTask
  void status
  void dueDate
  void completedAt
  void stale
  void attachments
  return definition
}
