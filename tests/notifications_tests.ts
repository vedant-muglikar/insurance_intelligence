/**
 * Notification Tests
 *
 * Derivation (due soon / today / overdue, admission approaching, risk alerts,
 * escalation keys), and the sync service against in-memory repositories:
 * read state survives refreshes, resolved reminders disappear, dismissed ones
 * stay hidden, events persist, users are isolated, and a missing table falls
 * back to an unpersisted list.
 */

import { randomUUID } from 'node:crypto'
import { daysUntil, deriveNotifications, isIsoDate, localToday, sortNotifications } from '../lib/notifications/derive'
import { listNotifications, markNotifications, recordChecklistSync } from '../lib/notifications/service'
import {
  NotificationStorageUnavailableError,
  type NotificationMark,
  type NotificationRepository,
  type NotificationRow,
} from '../lib/notifications/repository'
import { ChecklistInputError } from '../lib/checklist/service'
import type { ChecklistRepository, ChecklistRow, TaskRow } from '../lib/checklist/repository'
import type { ChecklistState, ChecklistTask, ChecklistTaskDefinition } from '../lib/types/checklist'
import type { NotificationDraft } from '../lib/types/notifications'

let failures = 0
function assert(condition: boolean, message: string, detail?: unknown) {
  if (!condition) {
    failures++
    console.error(`❌ FAIL: ${message}`)
    if (detail !== undefined) console.error('   ↳', typeof detail === 'string' ? detail : JSON.stringify(detail, null, 1).slice(0, 800))
    return
  }
  console.log(`✅ PASS: ${message}`)
}

async function rejects(fn: () => Promise<unknown>, predicate: (e: any) => boolean, message: string) {
  try {
    await fn()
    assert(false, message, 'did not throw')
  } catch (e) {
    assert(predicate(e), message, (e as Error)?.message)
  }
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TODAY = '2026-10-10'
const shift = (days: number) => new Date(Date.parse(TODAY) + days * 86_400_000).toISOString().slice(0, 10)

function def(key: string, extra: Partial<ChecklistTaskDefinition> = {}): ChecklistTaskDefinition {
  return {
    key,
    stage: 'before',
    title: `Task ${key}`,
    explanation: '',
    whyItMatters: 'It matters.',
    recommendedAction: `Do ${key}.`,
    priority: 'medium',
    requirementLevel: 'policy_term',
    references: [],
    needsVerification: false,
    ...extra,
  }
}

function task(key: string, extra: Partial<ChecklistTask> = {}): ChecklistTask {
  return { ...def(key), status: 'pending', dueDate: null, attachments: [], ...extra }
}

function state(tasks: ChecklistTask[], scenario: ChecklistState['checklist']['scenario'] = null, id = 'c1'): ChecklistState {
  return {
    checklist: {
      id,
      policyKey: `pdf:${id}abcdef`,
      insurer: 'Acme Health',
      planName: 'Family Floater',
      fileName: null,
      scenario,
      createdAt: TODAY,
      updatedAt: TODAY,
    },
    tasks,
  }
}

// ─── In-memory repositories ──────────────────────────────────────────────────

class MemoryChecklists {
  checklists: ChecklistRow[] = []
  tasks: TaskRow[] = []

  add(userId: string, policyKey: string, tasks: Array<{ key: string; due?: string; status?: 'pending' | 'completed'; extra?: Partial<ChecklistTaskDefinition> }>) {
    const c: ChecklistRow = {
      id: randomUUID(), user_id: userId, policy_key: policyKey, insurer: 'Acme Health', plan_name: 'Family Floater',
      file_name: null, scenario: null, generator_version: 1, created_at: TODAY, updated_at: TODAY,
    }
    this.checklists.push(c)
    for (const t of tasks) {
      this.tasks.push({
        id: randomUUID(), checklist_id: c.id, user_id: userId, task_key: t.key, definition: def(t.key, t.extra),
        status: t.status ?? 'pending', due_date: t.due ?? null, completed_at: null, stale: false, created_at: TODAY, updated_at: TODAY,
      })
    }
    return c
  }
  async listChecklists(userId: string, limit: number) {
    return this.checklists.filter((c) => c.user_id === userId).slice(0, limit)
  }
  async listTasks(userId: string, checklistId: string) {
    return this.tasks.filter((t) => t.user_id === userId && t.checklist_id === checklistId)
  }
  async listAttachments() {
    return []
  }
}

class MemoryNotes implements NotificationRepository {
  rows: NotificationRow[] = []
  writes = 0
  private clock = 0
  private now = () => new Date(Date.parse('2026-10-10T08:00:00Z') + this.clock++ * 1000).toISOString()

  async list(userId: string) {
    return this.rows.filter((r) => r.user_id === userId).sort((a, b) => b.created_at.localeCompare(a.created_at))
  }
  async upsert(userId: string, drafts: NotificationDraft[], derived: boolean) {
    for (const d of drafts) {
      this.writes++
      const row = this.rows.find((r) => r.user_id === userId && r.dedupe_key === d.key)
      const fields = {
        kind: d.kind, severity: d.severity, title: d.title, body: d.body, checklist_id: d.checklistId,
        policy_key: d.policyKey, policy_label: d.policyLabel, task_key: d.taskKey, derived,
      }
      if (row) Object.assign(row, fields)
      else this.rows.push({ id: randomUUID(), user_id: userId, dedupe_key: d.key, created_at: this.now(), read_at: null, dismissed_at: null, ...fields })
    }
  }
  async deleteByKeys(userId: string, keys: string[]) {
    this.rows = this.rows.filter((r) => !(r.user_id === userId && keys.includes(r.dedupe_key)))
  }
  async mark(userId: string, ids: string[] | 'all', field: NotificationMark) {
    for (const r of this.rows) {
      if (r.user_id === userId && !r[field] && (ids === 'all' || ids.includes(r.id))) r[field] = this.now()
    }
  }
}

class MissingTableNotes implements NotificationRepository {
  async list(): Promise<NotificationRow[]> {
    throw new NotificationStorageUnavailableError('PGRST205')
  }
  async upsert() {
    throw new NotificationStorageUnavailableError('PGRST205')
  }
  async deleteByKeys() {
    throw new NotificationStorageUnavailableError('PGRST205')
  }
  async mark() {
    throw new NotificationStorageUnavailableError('PGRST205')
  }
}

async function main() {
  console.log('\n--- Running Notification Tests ---\n')

  // ─── 1. Dates ────────────────────────────────────────────────────────────
  console.log('1. Date helpers:')
  assert(daysUntil(TODAY, shift(3)) === 3 && daysUntil(TODAY, shift(-2)) === -2, 'daysUntil counts whole calendar days')
  assert(localToday(new Date(2026, 0, 5, 23, 30)) === '2026-01-05', 'localToday uses the device calendar date, not UTC')
  assert(isIsoDate('2026-10-10') && !isIsoDate('10/10/2026') && !isIsoDate(undefined), 'isIsoDate accepts only YYYY-MM-DD')

  // ─── 2. Due-date reminders ──────────────────────────────────────────────
  console.log('\n2. Due-date reminders:')
  const drafts = deriveNotifications(
    [
      state([
        task('overdue', { dueDate: shift(-2) }),
        task('today', { dueDate: TODAY }),
        task('tomorrow', { suggestedDueDate: shift(1), dueDateBasis: 'Policy says 48 hours before admission.' }),
        task('later', { dueDate: shift(4) }),
        task('done', { dueDate: TODAY, status: 'completed' }),
        task('stale', { dueDate: TODAY, stale: true }),
        task('nodate'),
      ]),
    ],
    TODAY,
  )
  const byTask = (k: string) => drafts.filter((d) => d.taskKey === k)
  assert(byTask('overdue')[0]?.kind === 'task_overdue' && byTask('overdue')[0].title.startsWith('Overdue by 2 days'), 'Past due date → overdue reminder', byTask('overdue'))
  assert(byTask('today')[0]?.kind === 'task_due_today' && byTask('today')[0].severity === 'high', 'Due today → high-severity reminder')
  assert(byTask('tomorrow')[0]?.kind === 'task_due_soon' && byTask('tomorrow')[0].title.startsWith('Due tomorrow'), 'Suggested date tomorrow → due-soon reminder')
  assert(byTask('tomorrow')[0]?.body.includes('48 hours before admission'), 'Suggested-date reminders explain where the date came from')
  assert(byTask('later').length === 0, 'Nothing for dates more than 3 days away')
  assert(byTask('done').length === 0 && byTask('stale').length === 0 && byTask('nodate').length === 0, 'Completed, stale and undated tasks are ignored')
  assert(drafts.every((d) => d.policyLabel === 'Family Floater'), 'Every notification names the policy')

  const soonKey = deriveNotifications([state([task('t', { dueDate: shift(1) })])], TODAY)[0].key
  const todayKey = deriveNotifications([state([task('t', { dueDate: shift(1) })])], shift(1))[0].key
  const overdueKey = deriveNotifications([state([task('t', { dueDate: shift(1) })])], shift(2))[0].key
  assert(new Set([soonKey, todayKey, overdueKey]).size === 3, 'Escalating soon → today → overdue produces a new key each time')
  const sameTime = sortNotifications(drafts.map((d) => ({ ...d, createdAt: TODAY, readAt: null })))
  assert(sameTime[0].kind === 'task_overdue', 'Notifications that arrive together list the overdue one first', sameTime.map((d) => d.kind))

  // ─── 3. Admission & risk ────────────────────────────────────────────────
  console.log('\n3. Admission approaching and risk alerts:')
  const admission = deriveNotifications(
    [state([task('prep', { priority: 'high' }), task('during', { stage: 'during' })], { treatment: 'x', age: 40, roomType: 'single', stayDurationDays: 3, isNetworkHospital: true, proposedAdmissionDate: shift(5) } as any)],
    TODAY,
  ).find((d) => d.kind === 'admission_soon')
  assert(!!admission && admission.title === 'Planned admission in 5 days' && admission.body.startsWith('1 preparation task'), 'Admission within a week with pending prep → reminder', admission)
  assert(admission?.taskKey === 'prep', 'Admission reminder points at the most urgent preparation task')
  const farAdmission = deriveNotifications([state([task('prep')], { proposedAdmissionDate: shift(10) } as any)], TODAY)
  assert(!farAdmission.some((d) => d.kind === 'admission_soon'), 'No admission reminder more than 7 days out')

  const preauth = task('preauth', { priority: 'high', alertType: 'pre_authorization', requirementLevel: 'policy_requirement' })
  const risk = deriveNotifications([state([preauth])], TODAY)
  assert(risk.some((d) => d.kind === 'risk_alert' && d.title === 'Pre-authorization required by your policy'), 'High-severity risk alert becomes a notification', risk)
  const riskWithDue = deriveNotifications([state([{ ...preauth, dueDate: TODAY }])], TODAY)
  assert(riskWithDue.filter((d) => d.taskKey === 'preauth').length === 1, 'No duplicate risk alert when the same task already has a due reminder', riskWithDue)
  const medium = deriveNotifications([state([task('room', { priority: 'medium', alertType: 'room_rent' })])], TODAY)
  assert(!medium.some((d) => d.kind === 'risk_alert'), 'Medium-severity alerts stay in the checklist only')

  // ─── 4. Sync service ────────────────────────────────────────────────────
  console.log('\n4. Sync, read state and cleanup:')
  const alice = randomUUID()
  const bob = randomUUID()
  const checklists = new MemoryChecklists()
  const notes = new MemoryNotes()
  const repo = checklists as unknown as ChecklistRepository
  const c = checklists.add(alice, 'pdf:alice-policy', [{ key: 'a', due: TODAY }, { key: 'b', due: shift(2) }, { key: 'c', due: shift(9) }])
  checklists.add(bob, 'pdf:bob-policy', [{ key: 'x', due: TODAY }])

  let list = await listNotifications(repo, notes, alice, TODAY)
  assert(list.persisted && list.items.length === 2, 'Stores one reminder per qualifying task', list.items.map((i) => i.title))
  assert(list.items.every((i) => !i.title.includes('Task x')), "Another user's checklists never appear")

  const first = list.items.find((i) => i.taskKey === 'a')!
  await markNotifications(notes, alice, { action: 'read', ids: [first.id] })
  const writesBefore = notes.writes
  list = await listNotifications(repo, notes, alice, TODAY)
  assert(list.items.find((i) => i.taskKey === 'a')?.readAt != null, 'Read state survives a refresh')
  assert(notes.writes === writesBefore, 'Unchanged reminders are not rewritten on every poll')
  assert(list.items[list.items.length - 1].taskKey === 'a', 'Read notifications sort after unread ones')

  checklists.tasks.find((t) => t.checklist_id === c.id && t.task_key === 'b')!.status = 'completed'
  list = await listNotifications(repo, notes, alice, TODAY)
  assert(!list.items.some((i) => i.taskKey === 'b'), 'Completing a task removes its reminder')

  await markNotifications(notes, alice, { action: 'dismiss', ids: [first.id] })
  list = await listNotifications(repo, notes, alice, TODAY)
  assert(!list.items.some((i) => i.taskKey === 'a'), 'Dismissed reminders stay hidden while the condition holds')

  const stateForEvent = state([task('a')], null, c.id)
  await recordChecklistSync(notes, alice, stateForEvent, true)
  list = await listNotifications(repo, notes, alice, TODAY)
  const created = list.items.find((i) => i.kind === 'checklist_created')
  assert(!!created && created.title === 'Your preparation checklist is ready', 'Checklist-created event is stored', list.items)
  await recordChecklistSync(notes, alice, stateForEvent, true)
  assert(notes.rows.filter((r) => r.kind === 'checklist_created').length === 1, 'The created event is recorded once per checklist')

  await markNotifications(notes, alice, { action: 'read', all: true })
  list = await listNotifications(repo, notes, alice, TODAY)
  assert(list.items.every((i) => i.readAt), 'Mark all read')
  const bobList = await listNotifications(repo, notes, bob, TODAY)
  assert(bobList.items.length === 1 && !bobList.items[0].readAt, "Marking all read never touches another user's notifications")

  // ─── 5. Validation & fallback ───────────────────────────────────────────
  console.log('\n5. Validation and missing-table fallback:')
  await rejects(() => markNotifications(notes, alice, { action: 'delete', all: true }), (e) => e instanceof ChecklistInputError, 'Unknown action rejected')
  await rejects(() => markNotifications(notes, alice, { action: 'read', ids: ['not-a-uuid'] }), (e) => e instanceof ChecklistInputError, 'Non-UUID ids rejected')
  await rejects(() => markNotifications(notes, alice, { action: 'read' }), (e) => e instanceof ChecklistInputError, 'Requires ids or all')

  const fallback = await listNotifications(repo, new MissingTableNotes(), alice, TODAY)
  assert(!fallback.persisted && fallback.items.length === 1 && fallback.items[0].id === fallback.items[0].key, 'Missing table → derived list, unpersisted, keyed by dedupe key', fallback)
  await recordChecklistSync(new MissingTableNotes(), alice, stateForEvent, true)
  assert(true, 'Recording an event without the table does not throw')
}

main()
  .catch((err) => {
    failures++
    console.error('❌ Test run crashed:', err)
  })
  .finally(() => {
    if (failures > 0) {
      console.error(`\n${failures} notification test(s) failed.`)
      process.exit(1)
    }
    console.log('\n🎉 All notification tests passed.')
    process.exit(0)
  })
