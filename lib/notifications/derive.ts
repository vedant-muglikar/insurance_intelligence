/**
 * Pure notification logic shared by the server and the device-only fallback:
 * which checklist conditions deserve a notification, and how they are worded.
 * Keys are stable for the same condition, and change when it escalates
 * (due soon → due today → overdue), so each escalation arrives as unread.
 */

import type { ChecklistState } from '@/lib/types/checklist'
import type { AppNotification, NotificationDraft } from '@/lib/types/notifications'
import { computeRiskAlerts, effectiveDueDate } from '@/lib/checklist/state'
import { formatDateIndian } from '@/lib/policy/normalizers'

/** Pending tasks due within this many days get a reminder */
export const DUE_SOON_DAYS = 3
/** A planned admission within this many days, with preparation still pending, gets a reminder */
export const ADMISSION_SOON_DAYS = 7

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000

export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && ISO_DATE.test(value) && !isNaN(Date.parse(value))
}

/** The calendar date on this device (not UTC), as YYYY-MM-DD */
export function localToday(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Whole days from `today` to `date` (negative = in the past). Both are YYYY-MM-DD. */
export function daysUntil(today: string, date: string): number {
  return Math.round((Date.parse(date.slice(0, 10)) - Date.parse(today)) / DAY_MS)
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function dueLabel(days: number): string {
  if (days < 0) return `Overdue by ${plural(-days, 'day')}`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return `Due in ${days} days`
}

export function policyLabel(state: ChecklistState): string {
  const { planName, insurer, fileName } = state.checklist
  return planName || insurer || fileName || 'Your policy'
}

export function deriveNotifications(states: ChecklistState[], today: string): NotificationDraft[] {
  const out: NotificationDraft[] = []

  for (const state of states) {
    const { id: checklistId, policyKey } = state.checklist
    const label = policyLabel(state)
    const base = { checklistId, policyKey, policyLabel: label }
    const active = state.tasks.filter((t) => !t.stale)
    const remindedTasks = new Set<string>()

    for (const task of active) {
      if (task.status !== 'pending') continue
      const due = effectiveDueDate(task)
      if (!isIsoDate(due)) continue
      const days = daysUntil(today, due)
      if (days > DUE_SOON_DAYS) continue

      const phase = days < 0 ? 'overdue' : days === 0 ? 'today' : 'soon'
      remindedTasks.add(task.key)
      out.push({
        ...base,
        key: `due:${checklistId}:${task.key}:${due}:${phase}`,
        kind: phase === 'overdue' ? 'task_overdue' : phase === 'today' ? 'task_due_today' : 'task_due_soon',
        severity: phase === 'soon' ? 'medium' : 'high',
        title: `${dueLabel(days)}: ${task.title}`,
        body: task.dueDate
          ? `You set this for ${formatDateIndian(due)}. ${task.recommendedAction}`
          : `Suggested by ${formatDateIndian(due)}. ${task.dueDateBasis ?? task.recommendedAction}`,
        taskKey: task.key,
      })
    }

    const admission = state.checklist.scenario?.proposedAdmissionDate
    if (isIsoDate(admission)) {
      const days = daysUntil(today, admission)
      const pending = active.filter((t) => t.stage === 'before' && t.status === 'pending')
      if (days >= 0 && days <= ADMISSION_SOON_DAYS && pending.length > 0) {
        const imminent = days <= 1
        out.push({
          ...base,
          key: `admission:${checklistId}:${admission}:${imminent ? 'imminent' : 'week'}`,
          kind: 'admission_soon',
          severity: imminent ? 'high' : 'medium',
          title:
            days === 0
              ? 'Planned admission is today'
              : days === 1
                ? 'Planned admission is tomorrow'
                : `Planned admission in ${days} days`,
          body: `${plural(pending.length, 'preparation task')} still pending before admission on ${formatDateIndian(admission)}.`,
          taskKey: pending.find((t) => t.priority === 'high')?.key ?? pending[0].key,
        })
      }
    }

    for (const alert of computeRiskAlerts(state.tasks)) {
      if (alert.severity !== 'high') continue
      // A due-date reminder for the same task already asks for this action.
      if (alert.taskKeys.length > 0 && alert.taskKeys.every((k) => remindedTasks.has(k))) continue
      out.push({
        ...base,
        key: `risk:${checklistId}:${alert.id}`,
        kind: 'risk_alert',
        severity: 'high',
        title: alert.title,
        body: alert.nextAction,
        taskKey: alert.taskKeys[0] ?? null,
      })
    }
  }

  return out
}

const URGENCY: Record<AppNotification['kind'], number> = {
  task_overdue: 0,
  task_due_today: 1,
  admission_soon: 2,
  risk_alert: 3,
  task_due_soon: 4,
  checklist_updated: 5,
  checklist_created: 6,
}

/** Unread first, then newest first; notifications that arrived together go most urgent first */
export function sortNotifications<T extends Pick<AppNotification, 'readAt' | 'createdAt' | 'kind'>>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      Number(!!a.readAt) - Number(!!b.readAt) ||
      b.createdAt.localeCompare(a.createdAt) ||
      URGENCY[a.kind] - URGENCY[b.kind],
  )
}

/** One-off event when a checklist is first generated or regenerated */
export function checklistEventDraft(state: ChecklistState, created: boolean, at: string): NotificationDraft {
  const { id: checklistId, policyKey } = state.checklist
  const label = policyLabel(state)
  const active = state.tasks.filter((t) => !t.stale)
  const high = active.filter((t) => t.priority === 'high' && t.status === 'pending').length
  return {
    key: created ? `created:${checklistId}` : `updated:${checklistId}:${at}`,
    kind: created ? 'checklist_created' : 'checklist_updated',
    severity: 'info',
    title: created ? 'Your preparation checklist is ready' : 'Checklist updated',
    body: created
      ? `${plural(active.length, 'task')}${high ? `, ${high} high priority` : ''}. Open the Checklist tab to get started.`
      : 'Tasks were refreshed for your latest scenario. Your progress and documents were kept.',
    checklistId,
    policyKey,
    policyLabel: label,
    taskKey: null,
  }
}
