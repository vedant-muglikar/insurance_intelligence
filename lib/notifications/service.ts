/**
 * Notification use-cases on top of the checklist and notification repositories
 * (database-agnostic, so the route handlers and the tests share the same logic).
 */

import type { ChecklistState } from '@/lib/types/checklist'
import type { AppNotification, NotificationDraft, NotificationList } from '@/lib/types/notifications'
import type { ChecklistRepository } from '@/lib/checklist/repository'
import { ChecklistInputError, loadAllChecklists } from '@/lib/checklist/service'
import { checklistEventDraft, deriveNotifications, sortNotifications } from './derive'
import {
  NotificationStorageUnavailableError,
  type NotificationRepository,
  type NotificationRow,
} from './repository'

export const MAX_NOTIFICATIONS = 50

function toNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    key: row.dedupe_key,
    kind: row.kind,
    severity: row.severity,
    title: row.title,
    body: row.body,
    checklistId: row.checklist_id,
    policyKey: row.policy_key,
    policyLabel: row.policy_label,
    taskKey: row.task_key,
    createdAt: row.created_at,
    readAt: row.read_at,
  }
}

const sameWording = (row: NotificationRow, d: NotificationDraft) =>
  row.title === d.title && row.body === d.body && row.severity === d.severity && row.task_key === d.taskKey

/**
 * Re-derives reminders from the user's checklists, stores new ones, removes
 * those whose condition no longer holds (task completed, date moved…) and
 * returns the current list. Without a notifications table the derived list is
 * returned unpersisted and the client keeps read state on the device.
 */
export async function listNotifications(
  checklists: ChecklistRepository,
  notes: NotificationRepository,
  userId: string,
  today: string,
): Promise<NotificationList> {
  const states = await loadAllChecklists(checklists, userId)
  const drafts = deriveNotifications(states, today)

  try {
    const existing = await notes.list(userId)
    const byKey = new Map(existing.map((r) => [r.dedupe_key, r]))
    const wanted = new Set(drafts.map((d) => d.key))

    const changed = drafts.filter((d) => {
      const row = byKey.get(d.key)
      return !row || !sameWording(row, d)
    })
    const obsolete = existing.filter((r) => r.derived && !wanted.has(r.dedupe_key)).map((r) => r.dedupe_key)
    await notes.upsert(userId, changed, true)
    await notes.deleteByKeys(userId, obsolete)

    const rows = changed.length || obsolete.length ? await notes.list(userId) : existing
    const items = sortNotifications(rows.filter((r) => !r.dismissed_at).map(toNotification)).slice(0, MAX_NOTIFICATIONS)
    return { items, persisted: true }
  } catch (err) {
    if (!(err instanceof NotificationStorageUnavailableError)) throw err
    const now = new Date().toISOString()
    return {
      items: drafts.slice(0, MAX_NOTIFICATIONS).map((d) => ({ ...d, id: d.key, createdAt: now, readAt: null })),
      persisted: false,
    }
  }
}

/** Records "checklist ready / updated" after a sync. Best-effort: never fails the checklist request. */
export async function recordChecklistSync(
  notes: NotificationRepository,
  userId: string,
  state: ChecklistState,
  created: boolean,
): Promise<void> {
  try {
    await notes.upsert(userId, [checklistEventDraft(state, created, new Date().toISOString())], false)
  } catch (err) {
    if (!(err instanceof NotificationStorageUnavailableError)) console.error('[notifications/record]', (err as Error)?.message)
  }
}

export interface MarkNotificationsInput {
  action?: unknown
  ids?: unknown
  all?: unknown
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function markNotifications(
  notes: NotificationRepository,
  userId: string,
  input: MarkNotificationsInput,
): Promise<void> {
  if (input.action !== 'read' && input.action !== 'dismiss') throw new ChecklistInputError('action must be "read" or "dismiss".')
  const field = input.action === 'read' ? 'read_at' : 'dismissed_at'

  if (input.all === true) return notes.mark(userId, 'all', field)
  if (
    !Array.isArray(input.ids) ||
    input.ids.length === 0 ||
    input.ids.length > 100 ||
    !input.ids.every((id) => typeof id === 'string' && UUID.test(id))
  ) {
    throw new ChecklistInputError('Send "all": true or 1-100 notification ids.')
  }
  return notes.mark(userId, input.ids as string[], field)
}
