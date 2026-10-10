/**
 * Checklist use-cases on top of a ChecklistRepository (database-agnostic, so
 * the route handlers and the tests share exactly the same logic).
 */

import { randomUUID } from 'node:crypto'
import type {
  ChecklistAttachment,
  ChecklistScenario,
  ChecklistState,
  ChecklistTask,
} from '@/lib/types/checklist'
import { CHECKLIST_GENERATOR_VERSION, generateChecklist, type ChecklistGenerationInput } from './generator'
import { planMerge, sortTasks } from './state'
import { detectAttachmentType, MAX_ATTACHMENT_BYTES, safeFileName } from './attachments'
import type { AttachmentRow, ChecklistRepository, ChecklistRow, TaskRow } from './repository'

export class ChecklistInputError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'ChecklistInputError'
    this.status = status
  }
}

const POLICY_KEY = /^(pdf|sample|policy):[a-z0-9:_-]{6,190}$/i
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function assertPolicyKey(policyKey: unknown): asserts policyKey is string {
  if (typeof policyKey !== 'string' || !POLICY_KEY.test(policyKey)) {
    throw new ChecklistInputError('Invalid policy identifier.')
  }
}

function toAttachment(a: AttachmentRow): ChecklistAttachment {
  return {
    id: a.id,
    taskKey: a.task_key,
    fileName: a.file_name,
    mimeType: a.mime_type,
    sizeBytes: a.size_bytes,
    createdAt: a.created_at,
  }
}

function toTask(row: TaskRow, attachments: AttachmentRow[]): ChecklistTask {
  return {
    ...row.definition,
    key: row.task_key,
    status: row.status,
    dueDate: row.due_date,
    completedAt: row.completed_at,
    stale: row.stale,
    attachments: attachments.filter((a) => a.task_key === row.task_key).map(toAttachment),
  }
}

async function buildState(repo: ChecklistRepository, userId: string, checklist: ChecklistRow): Promise<ChecklistState> {
  const [tasks, attachments] = await Promise.all([
    repo.listTasks(userId, checklist.id),
    repo.listAttachments(userId, checklist.id),
  ])
  return {
    checklist: {
      id: checklist.id,
      policyKey: checklist.policy_key,
      insurer: checklist.insurer,
      planName: checklist.plan_name,
      fileName: checklist.file_name,
      scenario: checklist.scenario,
      createdAt: checklist.created_at,
      updatedAt: checklist.updated_at,
    },
    tasks: sortTasks(tasks.map((t) => toTask(t, attachments))),
  }
}

export async function loadChecklist(
  repo: ChecklistRepository,
  userId: string,
  policyKey: string,
): Promise<ChecklistState | null> {
  assertPolicyKey(policyKey)
  const checklist = await repo.findChecklist(userId, policyKey)
  return checklist ? buildState(repo, userId, checklist) : null
}

export interface SyncChecklistInput {
  policyKey: string
  insurer?: string | null
  planName?: string | null
  fileName?: string | null
  /** Omit to keep the stored scenario; pass null to clear it */
  scenario?: ChecklistScenario | null
  generation: Omit<ChecklistGenerationInput, 'scenario'>
}

/**
 * Creates the checklist on first use, or regenerates task definitions from the
 * current policy data + scenario while preserving saved progress.
 */
export async function syncChecklist(
  repo: ChecklistRepository,
  userId: string,
  input: SyncChecklistInput,
): Promise<ChecklistState> {
  assertPolicyKey(input.policyKey)
  if (!Array.isArray(input.generation?.rules)) throw new ChecklistInputError('Policy rules are required.')
  if (input.generation.rules.length > 1000) throw new ChecklistInputError('Too many policy rules.')

  const existing = await repo.findChecklist(userId, input.policyKey)
  const scenario = input.scenario === undefined ? existing?.scenario ?? null : input.scenario

  const checklist = await repo.upsertChecklist(userId, {
    policy_key: input.policyKey,
    insurer: input.insurer ?? existing?.insurer ?? null,
    plan_name: input.planName ?? existing?.plan_name ?? null,
    file_name: input.fileName ?? existing?.file_name ?? null,
    scenario,
    generator_version: CHECKLIST_GENERATOR_VERSION,
  })

  const generated = generateChecklist({ ...input.generation, scenario })
  const [savedTasks, attachments] = await Promise.all([
    repo.listTasks(userId, checklist.id),
    repo.listAttachments(userId, checklist.id),
  ])
  const withFiles = new Set(attachments.map((a) => a.task_key))
  const plan = planMerge(
    generated,
    savedTasks.map((t) => ({
      key: t.task_key,
      status: t.status,
      dueDate: t.due_date,
      completedAt: t.completed_at,
      hasAttachments: withFiles.has(t.task_key),
      definition: t.definition,
    })),
  )

  await repo.upsertTaskDefinitions(
    userId,
    checklist.id,
    plan.upserts.map((u) => ({ task_key: u.definition.key, definition: u.definition, stale: u.stale })),
  )
  await repo.deleteTasks(userId, checklist.id, plan.deletes)

  return buildState(repo, userId, checklist)
}

export interface TaskUpdateInput {
  checklistId: string
  taskKey: string
  status?: unknown
  dueDate?: unknown
}

export async function updateTaskState(
  repo: ChecklistRepository,
  userId: string,
  input: TaskUpdateInput,
): Promise<ChecklistTask> {
  if (typeof input.checklistId !== 'string' || typeof input.taskKey !== 'string') {
    throw new ChecklistInputError('checklistId and taskKey are required.')
  }
  const patch: { status?: 'pending' | 'completed'; due_date?: string | null; completed_at?: string | null } = {}
  if (input.status !== undefined) {
    if (input.status !== 'pending' && input.status !== 'completed') throw new ChecklistInputError('Invalid status.')
    patch.status = input.status
    patch.completed_at = input.status === 'completed' ? new Date().toISOString() : null
  }
  if (input.dueDate !== undefined) {
    if (input.dueDate !== null && (typeof input.dueDate !== 'string' || !ISO_DATE.test(input.dueDate) || isNaN(Date.parse(input.dueDate)))) {
      throw new ChecklistInputError('Due date must be YYYY-MM-DD.')
    }
    patch.due_date = input.dueDate as string | null
  }
  if (Object.keys(patch).length === 0) throw new ChecklistInputError('Nothing to update.')

  const row = await repo.updateTask(userId, input.checklistId, input.taskKey, patch)
  if (!row) throw new ChecklistInputError('Task not found.', 404)
  const attachments = await repo.listAttachments(userId, input.checklistId)
  return toTask(row, attachments)
}

export interface AttachmentUploadInput {
  checklistId: string
  taskKey: string
  fileName: string
  bytes: Uint8Array
}

export async function addAttachment(
  repo: ChecklistRepository,
  userId: string,
  input: AttachmentUploadInput,
): Promise<ChecklistAttachment> {
  if (!input.bytes || input.bytes.length === 0) throw new ChecklistInputError('The file is empty.')
  if (input.bytes.length > MAX_ATTACHMENT_BYTES) throw new ChecklistInputError('Files must be 10 MB or smaller.', 413)
  const mime = detectAttachmentType(input.bytes)
  if (!mime) throw new ChecklistInputError('Only PDF, JPEG, PNG or WebP files can be attached.')

  const checklist = await repo.getChecklistById(userId, input.checklistId)
  if (!checklist) throw new ChecklistInputError('Checklist not found.', 404)
  const tasks = await repo.listTasks(userId, checklist.id)
  if (!tasks.some((t) => t.task_key === input.taskKey)) throw new ChecklistInputError('Task not found.', 404)

  const fileName = safeFileName(input.fileName)
  const storagePath = `${userId}/${checklist.id}/${randomUUID()}-${fileName.replace(/\s+/g, '_')}`
  await repo.uploadObject(storagePath, input.bytes, mime)
  try {
    const row = await repo.insertAttachment({
      checklist_id: checklist.id,
      task_key: input.taskKey,
      user_id: userId,
      file_name: fileName,
      mime_type: mime,
      size_bytes: input.bytes.length,
      storage_path: storagePath,
    })
    return toAttachment(row)
  } catch (err) {
    await repo.removeObject(storagePath).catch(() => {})
    throw err
  }
}

export async function removeAttachment(repo: ChecklistRepository, userId: string, attachmentId: string): Promise<void> {
  const row = await repo.getAttachment(userId, attachmentId)
  if (!row) throw new ChecklistInputError('Attachment not found.', 404)
  await repo.removeObject(row.storage_path)
  await repo.deleteAttachment(userId, attachmentId)
}

/** Short-lived signed URL; documents are never publicly readable */
export async function attachmentDownloadUrl(
  repo: ChecklistRepository,
  userId: string,
  attachmentId: string,
): Promise<string> {
  const row = await repo.getAttachment(userId, attachmentId)
  if (!row) throw new ChecklistInputError('Attachment not found.', 404)
  return repo.signedObjectUrl(row.storage_path, 60)
}
