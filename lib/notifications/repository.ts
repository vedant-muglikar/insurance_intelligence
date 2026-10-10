/**
 * Notification persistence. Like the checklist repository, the Supabase
 * implementation runs as the signed-in user, so the RLS policy in
 * supabase/migrations/20261010130000_notifications.sql always applies, and
 * every query also filters by user_id.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { isMissingRelationError } from '@/lib/checklist/repository'
import type { NotificationDraft, NotificationKind, NotificationSeverity } from '@/lib/types/notifications'

export interface NotificationRow {
  id: string
  user_id: string
  dedupe_key: string
  kind: NotificationKind
  severity: NotificationSeverity
  title: string
  body: string
  checklist_id: string | null
  policy_key: string | null
  policy_label: string | null
  task_key: string | null
  derived: boolean
  created_at: string
  read_at: string | null
  dismissed_at: string | null
}

export type NotificationMark = 'read_at' | 'dismissed_at'

export interface NotificationRepository {
  /** All rows including dismissed ones (needed to avoid re-creating them) */
  list(userId: string): Promise<NotificationRow[]>
  /** Inserts new rows; for existing keys refreshes only the wording, never read/dismissed state */
  upsert(userId: string, drafts: NotificationDraft[], derived: boolean): Promise<void>
  deleteByKeys(userId: string, keys: string[]): Promise<void>
  /** Sets the timestamp on the given ids, or on every row when ids is 'all' */
  mark(userId: string, ids: string[] | 'all', field: NotificationMark): Promise<void>
}

/** The notifications table is missing — the client keeps read state on the device instead */
export class NotificationStorageUnavailableError extends Error {
  constructor(detail?: string) {
    super(
      'Notification storage is not set up. Apply supabase/migrations/20261010130000_notifications.sql to your Supabase project.' +
        (detail ? ` (${detail})` : ''),
    )
    this.name = 'NotificationStorageUnavailableError'
  }
}

function check<T>(result: { data: T; error: any }): T {
  if (result.error) {
    if (isMissingRelationError(result.error)) throw new NotificationStorageUnavailableError(result.error.code)
    throw new Error(result.error.message || 'Database request failed')
  }
  return result.data
}

const toRow = (userId: string, d: NotificationDraft, derived: boolean) => ({
  user_id: userId,
  dedupe_key: d.key,
  kind: d.kind,
  severity: d.severity,
  title: d.title.slice(0, 300),
  body: d.body.slice(0, 1000),
  checklist_id: d.checklistId,
  policy_key: d.policyKey,
  policy_label: d.policyLabel,
  task_key: d.taskKey,
  derived,
})

export class SupabaseNotificationRepository implements NotificationRepository {
  constructor(private readonly db: SupabaseClient) {}

  async list(userId: string) {
    return (check(
      await this.db
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(500),
    ) ?? []) as NotificationRow[]
  }

  async upsert(userId: string, drafts: NotificationDraft[], derived: boolean) {
    if (drafts.length === 0) return
    // read_at / dismissed_at / created_at are not sent, so ON CONFLICT keeps them
    check(
      await this.db
        .from('notifications')
        .upsert(drafts.map((d) => toRow(userId, d, derived)), { onConflict: 'user_id,dedupe_key' }),
    )
  }

  async deleteByKeys(userId: string, keys: string[]) {
    if (keys.length === 0) return
    check(await this.db.from('notifications').delete().eq('user_id', userId).in('dedupe_key', keys))
  }

  async mark(userId: string, ids: string[] | 'all', field: NotificationMark) {
    let query = this.db
      .from('notifications')
      .update({ [field]: new Date().toISOString() })
      .eq('user_id', userId)
      .is(field, null)
    if (ids !== 'all') {
      if (ids.length === 0) return
      query = query.in('id', ids)
    }
    check(await query)
  }
}
