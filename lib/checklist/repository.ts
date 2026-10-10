/**
 * Checklist persistence. The service layer depends only on the
 * ChecklistRepository interface; SupabaseChecklistRepository runs every query
 * as the signed-in user, so the RLS policies in
 * supabase/migrations/20261010120000_policy_checklists.sql always apply.
 * Queries additionally filter by user_id as defence in depth.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChecklistScenario, ChecklistTaskDefinition } from '@/lib/types/checklist'

export const CHECKLIST_BUCKET = 'checklist-documents'

export interface ChecklistRow {
  id: string
  user_id: string
  policy_key: string
  insurer: string | null
  plan_name: string | null
  file_name: string | null
  scenario: ChecklistScenario | null
  generator_version: number
  created_at: string
  updated_at: string
}

export interface TaskRow {
  id: string
  checklist_id: string
  user_id: string
  task_key: string
  definition: ChecklistTaskDefinition
  status: 'pending' | 'completed'
  due_date: string | null
  completed_at: string | null
  stale: boolean
  created_at: string
  updated_at: string
}

export interface AttachmentRow {
  id: string
  checklist_id: string
  task_key: string
  user_id: string
  file_name: string
  mime_type: string
  size_bytes: number
  storage_path: string
  created_at: string
}

export interface ChecklistUpsert {
  policy_key: string
  insurer?: string | null
  plan_name?: string | null
  file_name?: string | null
  scenario?: ChecklistScenario | null
  generator_version: number
}

export interface TaskPatch {
  status?: 'pending' | 'completed'
  due_date?: string | null
  completed_at?: string | null
}

export interface ChecklistRepository {
  findChecklist(userId: string, policyKey: string): Promise<ChecklistRow | null>
  getChecklistById(userId: string, id: string): Promise<ChecklistRow | null>
  upsertChecklist(userId: string, input: ChecklistUpsert): Promise<ChecklistRow>
  listTasks(userId: string, checklistId: string): Promise<TaskRow[]>
  /** Inserts or updates definitions only — never touches status, due date or completion */
  upsertTaskDefinitions(
    userId: string,
    checklistId: string,
    rows: Array<{ task_key: string; definition: ChecklistTaskDefinition; stale: boolean }>,
  ): Promise<void>
  deleteTasks(userId: string, checklistId: string, taskKeys: string[]): Promise<void>
  updateTask(userId: string, checklistId: string, taskKey: string, patch: TaskPatch): Promise<TaskRow | null>
  listAttachments(userId: string, checklistId: string): Promise<AttachmentRow[]>
  insertAttachment(row: Omit<AttachmentRow, 'id' | 'created_at'>): Promise<AttachmentRow>
  getAttachment(userId: string, id: string): Promise<AttachmentRow | null>
  deleteAttachment(userId: string, id: string): Promise<void>
  uploadObject(path: string, bytes: Uint8Array, contentType: string): Promise<void>
  removeObject(path: string): Promise<void>
  signedObjectUrl(path: string, expiresInSeconds: number): Promise<string>
}

/** The database tables or storage bucket are missing / not configured */
export class ChecklistStorageUnavailableError extends Error {
  constructor(detail?: string) {
    super(
      'Checklist storage is not set up. Apply supabase/migrations/20261010120000_policy_checklists.sql to your Supabase project.' +
        (detail ? ` (${detail})` : ''),
    )
    this.name = 'ChecklistStorageUnavailableError'
  }
}

const MISSING_RELATION_CODES = new Set(['PGRST205', 'PGRST202', '42P01', '42883'])

function check<T>(result: { data: T; error: any }): T {
  if (result.error) {
    const code = result.error.code as string | undefined
    if (code && MISSING_RELATION_CODES.has(code)) throw new ChecklistStorageUnavailableError(code)
    throw new Error(result.error.message || 'Database request failed')
  }
  return result.data
}

export class SupabaseChecklistRepository implements ChecklistRepository {
  constructor(private readonly db: SupabaseClient) {}

  async findChecklist(userId: string, policyKey: string) {
    return check(
      await this.db
        .from('policy_checklists')
        .select('*')
        .eq('user_id', userId)
        .eq('policy_key', policyKey)
        .maybeSingle(),
    ) as ChecklistRow | null
  }

  async getChecklistById(userId: string, id: string) {
    return check(
      await this.db.from('policy_checklists').select('*').eq('user_id', userId).eq('id', id).maybeSingle(),
    ) as ChecklistRow | null
  }

  async upsertChecklist(userId: string, input: ChecklistUpsert) {
    return check(
      await this.db
        .from('policy_checklists')
        .upsert({ ...input, user_id: userId }, { onConflict: 'user_id,policy_key' })
        .select('*')
        .single(),
    ) as ChecklistRow
  }

  async listTasks(userId: string, checklistId: string) {
    return (check(
      await this.db.from('checklist_tasks').select('*').eq('user_id', userId).eq('checklist_id', checklistId),
    ) ?? []) as TaskRow[]
  }

  async upsertTaskDefinitions(
    userId: string,
    checklistId: string,
    rows: Array<{ task_key: string; definition: ChecklistTaskDefinition; stale: boolean }>,
  ) {
    if (rows.length === 0) return
    // Only these columns are sent, so ON CONFLICT never overwrites user progress
    check(
      await this.db.from('checklist_tasks').upsert(
        rows.map((r) => ({ ...r, checklist_id: checklistId, user_id: userId })),
        { onConflict: 'checklist_id,task_key' },
      ),
    )
  }

  async deleteTasks(userId: string, checklistId: string, taskKeys: string[]) {
    if (taskKeys.length === 0) return
    check(
      await this.db
        .from('checklist_tasks')
        .delete()
        .eq('user_id', userId)
        .eq('checklist_id', checklistId)
        .in('task_key', taskKeys),
    )
  }

  async updateTask(userId: string, checklistId: string, taskKey: string, patch: TaskPatch) {
    return check(
      await this.db
        .from('checklist_tasks')
        .update(patch)
        .eq('user_id', userId)
        .eq('checklist_id', checklistId)
        .eq('task_key', taskKey)
        .select('*')
        .maybeSingle(),
    ) as TaskRow | null
  }

  async listAttachments(userId: string, checklistId: string) {
    return (check(
      await this.db
        .from('checklist_attachments')
        .select('*')
        .eq('user_id', userId)
        .eq('checklist_id', checklistId)
        .order('created_at', { ascending: true }),
    ) ?? []) as AttachmentRow[]
  }

  async insertAttachment(row: Omit<AttachmentRow, 'id' | 'created_at'>) {
    return check(await this.db.from('checklist_attachments').insert(row).select('*').single()) as AttachmentRow
  }

  async getAttachment(userId: string, id: string) {
    return check(
      await this.db.from('checklist_attachments').select('*').eq('user_id', userId).eq('id', id).maybeSingle(),
    ) as AttachmentRow | null
  }

  async deleteAttachment(userId: string, id: string) {
    check(await this.db.from('checklist_attachments').delete().eq('user_id', userId).eq('id', id))
  }

  async uploadObject(path: string, bytes: Uint8Array, contentType: string) {
    const { error } = await this.db.storage.from(CHECKLIST_BUCKET).upload(path, bytes, { contentType, upsert: false })
    if (error) {
      if (/bucket not found/i.test(error.message)) throw new ChecklistStorageUnavailableError('storage bucket missing')
      throw new Error(error.message)
    }
  }

  async removeObject(path: string) {
    const { error } = await this.db.storage.from(CHECKLIST_BUCKET).remove([path])
    if (error) throw new Error(error.message)
  }

  async signedObjectUrl(path: string, expiresInSeconds: number) {
    const { data, error } = await this.db.storage.from(CHECKLIST_BUCKET).createSignedUrl(path, expiresInSeconds)
    if (error || !data?.signedUrl) {
      if (error && /bucket not found/i.test(error.message)) throw new ChecklistStorageUnavailableError('storage bucket missing')
      throw new Error(error?.message || 'Could not create a download link')
    }
    return data.signedUrl
  }
}
