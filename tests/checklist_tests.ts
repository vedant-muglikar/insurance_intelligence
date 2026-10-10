/**
 * ClaimLens Hospitalization Checklist Tests
 *
 * Generation grounding (no invented terms/obligations/deadlines), scenario
 * personalisation, risk alerts, persistence (sync / restore / regenerate keeps
 * progress), document attachments, per-user isolation, and error mapping.
 * Persistence runs against an in-memory implementation of the same
 * ChecklistRepository interface used by the Supabase implementation.
 */

import { randomUUID } from 'node:crypto'
import { generateChecklist, extractDeadlines } from '../lib/checklist/generator'
import { computeProgress, computeRiskAlerts, applyLocalMerge } from '../lib/checklist/state'
import {
  addAttachment,
  attachmentDownloadUrl,
  ChecklistInputError,
  loadChecklist,
  removeAttachment,
  syncChecklist,
  updateTaskState,
} from '../lib/checklist/service'
import {
  ChecklistStorageUnavailableError,
  SupabaseChecklistRepository,
  type AttachmentRow,
  type ChecklistRepository,
  type ChecklistRow,
  type TaskRow,
} from '../lib/checklist/repository'
import { detectAttachmentType, safeFileName } from '../lib/checklist/attachments'
import { getPolicyKey } from '../lib/checklist/policyKey'
import { toErrorResponse } from '../lib/checklist/http'
import { SAMPLE_POLICIES } from '../lib/policy/samplePolicies'
import { compilePolicyRules } from '../lib/policy/compiler'
import type { PolicyRule } from '../lib/types/policy'
import type { ChecklistScenario, ChecklistTask } from '../lib/types/checklist'

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

// ─── Fixtures: rules in the shape the AI extractor produces ──────────────────

let n = 0
function rule(p: Partial<PolicyRule>): PolicyRule {
  n++
  return {
    id: `rule-${n}`,
    category: 'general',
    rule_name: 'Rule',
    value: '',
    description: '',
    status: 'covered',
    conditions: [],
    page_number: 1,
    section_name: 'General',
    evidence_text: '',
    confidence: 'high',
    evidence_validated: true,
    ...p,
  }
}

const RULES: PolicyRule[] = [
  rule({ category: 'sum_insured', rule_name: 'Sum Insured', value: 'Rs 5,00,000', page_number: 2, section_name: 'Schedule', evidence_text: 'Sum Insured Rs 5,00,000 per policy year' }),
  rule({
    category: 'claim_requirement', rule_name: 'Intimation of hospitalisation', value: '48 hours before admission',
    description: 'Planned hospitalisation to be intimated 48 hours before admission; emergency within 24 hours of admission.',
    page_number: 7, section_name: 'Section 6.1',
    evidence_text: 'Planned hospitalisation must be intimated at least 48 hours before admission and emergency hospitalisation within 24 hours of admission for cashless pre-authorization.',
  }),
  rule({
    category: 'claim_requirement', rule_name: 'Submission of claim documents', value: '30 days',
    description: 'Claim documents to be submitted within 30 days of discharge.',
    page_number: 8, section_name: 'Section 6.3',
    evidence_text: 'The claim form, discharge summary, original bills, prescriptions and investigation reports shall be submitted within 30 days of discharge.',
  }),
  rule({ category: 'waiting_period', rule_name: 'Specific Illness Waiting Period', value: '24 months', page_number: 5, section_name: 'Section 4.2', evidence_text: '24 months for cataract, hernia and joint replacement surgery', description: 'Specific illnesses have a 24-month waiting period.' }),
  rule({ category: 'waiting_period', rule_name: 'Initial Waiting Period', value: '30 days', page_number: 5, section_name: 'Section 4.1', evidence_text: 'Initial waiting period of 30 days except accidents' }),
  rule({ category: 'waiting_period', rule_name: 'Pre-existing Diseases', value: '36 months', page_number: 5, section_name: 'Section 4.3', evidence_text: 'Pre-existing diseases are covered after 36 months' }),
  rule({ category: 'room_rent', rule_name: 'Room Rent Limit', value: 'Single private room', page_number: 3, section_name: 'Section 2.1', evidence_text: 'Room rent up to a single private room; proportionate deduction applies for higher categories', description: 'Room rent limited to single private room with proportionate deduction.' }),
  rule({ category: 'co_payment', rule_name: 'Senior co-payment', value: '20%', page_number: 4, evidence_text: '20% co-payment for insured aged above 60', conditions: ['Age above 60'] }),
  rule({ category: 'exclusion', rule_name: 'Cosmetic surgery', value: 'Not covered', status: 'not_covered', page_number: 9, evidence_text: 'Cosmetic or plastic surgery unless required after an accident' }),
  rule({ category: 'exclusion', rule_name: 'Consumables', value: 'Not payable', status: 'not_covered', page_number: 9, evidence_text: 'Gloves, PPE kits and other consumables are not payable' }),
  rule({ category: 'sub_limit', rule_name: 'Cataract sub-limit', value: 'Rs 40,000 per eye', page_number: 4, evidence_text: 'Cataract Rs 40,000 per eye' }),
  rule({ category: 'sub_limit', rule_name: 'Knee replacement sub-limit', value: 'Rs 1,50,000', page_number: 4, evidence_text: 'Joint replacement surgery limited to Rs 1,50,000' }),
  rule({ category: 'claim_requirement', rule_name: 'Network hospital list', value: 'Cashless at network hospitals', page_number: 7, evidence_text: 'Cashless facility is available only at network hospitals', confidence: 'low', evidence_validated: false }),
]
const COMPILED = compilePolicyRules(RULES)

const SCENARIO: ChecklistScenario = {
  treatment: 'Total Knee Replacement',
  age: 64,
  roomType: 'suite',
  stayDurationDays: 4,
  policyStartDate: '2025-06-01',
  proposedAdmissionDate: '2026-11-10',
  isNetworkHospital: false,
}

// ─── In-memory repository (same contract as SupabaseChecklistRepository) ─────

class MemoryRepo implements ChecklistRepository {
  checklists: ChecklistRow[] = []
  tasks: TaskRow[] = []
  attachments: AttachmentRow[] = []
  objects = new Map<string, Uint8Array>()
  private now = () => new Date().toISOString()

  async findChecklist(userId: string, policyKey: string) {
    return this.checklists.find((c) => c.user_id === userId && c.policy_key === policyKey) ?? null
  }
  async getChecklistById(userId: string, id: string) {
    return this.checklists.find((c) => c.user_id === userId && c.id === id) ?? null
  }
  async upsertChecklist(userId: string, input: any) {
    let row = await this.findChecklist(userId, input.policy_key)
    if (row) {
      for (const [k, v] of Object.entries(input)) if (v !== undefined) (row as any)[k] = v
      row.updated_at = this.now()
    } else {
      row = { id: randomUUID(), user_id: userId, insurer: null, plan_name: null, file_name: null, scenario: null, created_at: this.now(), updated_at: this.now(), ...input } as ChecklistRow
      this.checklists.push(row)
    }
    return row
  }
  async listTasks(userId: string, checklistId: string) {
    return this.tasks.filter((t) => t.user_id === userId && t.checklist_id === checklistId)
  }
  async upsertTaskDefinitions(userId: string, checklistId: string, rows: any[]) {
    if (!this.checklists.some((c) => c.id === checklistId && c.user_id === userId)) throw new Error('RLS violation')
    for (const r of rows) {
      const existing = this.tasks.find((t) => t.checklist_id === checklistId && t.task_key === r.task_key)
      if (existing) {
        existing.definition = r.definition
        existing.stale = r.stale
      } else {
        this.tasks.push({ id: randomUUID(), checklist_id: checklistId, user_id: userId, task_key: r.task_key, definition: r.definition, stale: r.stale, status: 'pending', due_date: null, completed_at: null, created_at: this.now(), updated_at: this.now() })
      }
    }
  }
  async deleteTasks(userId: string, checklistId: string, keys: string[]) {
    this.tasks = this.tasks.filter((t) => !(t.user_id === userId && t.checklist_id === checklistId && keys.includes(t.task_key)))
  }
  async updateTask(userId: string, checklistId: string, key: string, patch: any) {
    const t = this.tasks.find((x) => x.user_id === userId && x.checklist_id === checklistId && x.task_key === key)
    if (!t) return null
    Object.assign(t, patch)
    return t
  }
  async listAttachments(userId: string, checklistId: string) {
    return this.attachments.filter((a) => a.user_id === userId && a.checklist_id === checklistId)
  }
  async insertAttachment(row: any) {
    const full = { ...row, id: randomUUID(), created_at: this.now() }
    this.attachments.push(full)
    return full
  }
  async getAttachment(userId: string, id: string) {
    return this.attachments.find((a) => a.user_id === userId && a.id === id) ?? null
  }
  async deleteAttachment(userId: string, id: string) {
    this.attachments = this.attachments.filter((a) => !(a.user_id === userId && a.id === id))
  }
  async uploadObject(path: string, bytes: Uint8Array) {
    this.objects.set(path, bytes)
  }
  async removeObject(path: string) {
    this.objects.delete(path)
  }
  async signedObjectUrl(path: string, expires: number) {
    return `https://storage.example/${path}?expires=${expires}`
  }
}

const find = (tasks: { key: string }[], key: string) => tasks.find((t) => t.key === key) as any
const asTasks = (defs: ReturnType<typeof generateChecklist>): ChecklistTask[] =>
  defs.map((d) => ({ ...d, status: 'pending', attachments: [] }))

async function main() {
  console.log('\n--- Running ClaimLens Checklist Tests ---\n')

  // ─── 1. Deadline extraction ──────────────────────────────────────────────
  console.log('1. Policy deadline extraction:')
  const dl = extractDeadlines('must be intimated at least 48 hours before admission and emergency within 24 hours of admission; documents within 30 days of discharge')
  assert(dl.length === 3, 'Finds all three periods in one clause', dl)
  assert(dl[0].relation === 'before' && dl[0].unit === 'hours' && dl[0].amount === 48, '48 hours *before* admission')
  assert(dl[2].anchor === 'discharge' && dl[2].amount === 30, '30 days of discharge anchored to discharge')

  // ─── 2. Generation without a scenario ───────────────────────────────────
  console.log('\n2. Policy-only generation (grounded, no invented terms):')
  const base = generateChecklist({ rules: RULES, compiledRules: COMPILED })
  const stages = new Set(base.map((t) => t.stage))
  assert(stages.has('before') && stages.has('during') && stages.has('claim'), 'Tasks organised into all three stages')
  assert(base.every((t) => t.requirementLevel === 'recommendation' || t.references.length > 0), 'Every policy-derived task cites at least one clause')
  assert(base.filter((t) => t.references.length > 0).every((t) => t.references.every((r) => r.page !== null)), 'Every cited clause carries a page reference')
  const obligationOk = base
    .filter((t) => t.requirementLevel === 'policy_requirement')
    .every((t) => t.references.some((r) => /\b(must|shall|mandatory|required|compulsor)/i.test(r.quote)))
  assert(obligationOk, '"Policy requirement" only where the cited clause uses obligation wording')
  assert(base.every((t) => !t.suggestedDueDate), 'No due dates are invented without scenario dates')
  assert(base.every((t) => !t.scenarioSpecific), 'No scenario-specific tasks without a scenario')

  const planned = find(base, 'preauth:planned')
  assert(!!planned && planned.title.includes('48 hours before admission') && planned.requirementLevel === 'policy_requirement', 'Pre-authorization task quotes the policy deadline (48 hours before admission)', planned?.title)
  assert(planned?.references[0]?.page === 7, 'Pre-authorization task cites page 7')
  const emergency = find(base, 'preauth:emergency')
  assert(!!emergency && emergency.title.includes('24 hours of admission') && emergency.stage === 'during', 'Emergency intimation task uses the 24-hour period, in "During treatment"', emergency?.title)
  const submission = find(base, 'claim:submission-deadline')
  assert(!!submission && submission.title.includes('30 days of discharge') && submission.references[0].page === 8, 'Claim submission deadline from page 8', submission?.title)
  for (const doc of ['claim_form', 'discharge_summary', 'final_bill', 'prescriptions', 'investigation_reports']) {
    const t = find(base, `doc:${doc}`)
    assert(!!t && t.requirementLevel === 'policy_requirement' && t.documentType === doc && t.references[0].page === 8, `Document task "${doc}" grounded in the page-8 clause`)
  }
  assert(!find(base, 'doc:id_proof') && !find(base, 'doc:fir_mlc'), 'Documents the policy never mentions are not added')
  const room = find(base, 'room:eligible-category')
  assert(room?.requirementLevel === 'policy_term' && /proportionate/.test(room.whyItMatters), 'Room-rent task is a policy term and mentions proportionate deduction from the clause')
  const network = find(base, 'network:confirm-hospital')
  assert(network?.needsVerification === true, 'Task from a low-confidence, unverified clause is flagged for verification')
  assert(!!find(base, 'during:non-payable-items'), 'Consumables exclusion becomes a "during treatment" task')

  // ─── 3. Generation with scenario + preflight signals ───────────────────
  console.log('\n3. Scenario personalisation (reuses Preflight results, no recalculation):')
  const kneeRule = RULES.find((r) => r.rule_name === 'Knee replacement sub-limit')!
  const personal = generateChecklist({
    rules: RULES,
    compiledRules: COMPILED,
    scenario: SCENARIO,
    preflight: {
      status: 'not_eligible',
      waitingPeriodDetails: { requiredMonths: 24, completionDate: '2027-06-01', isActive: true },
      ledger: [{ ruleId: 'x', ruleName: 'Room cap', ruleType: 'ROOM_LIMIT', deductionAmount: 12000, impact: 'deduction' }],
    },
  })
  const wait = personal.find((t) => t.key.startsWith('wait:specific-illness'))
  assert(Boolean(wait && wait.priority === 'high' && wait.scenarioSpecific && /Total Knee Replacement/.test(wait.title)), 'Joint-replacement waiting period matched to knee replacement', wait?.title)
  assert(Boolean(wait && wait.explanation.includes('2027-06-01')), 'Waiting-period task quotes the Preflight completion date', wait?.explanation)
  const kneeLimit = personal.find((t) => t.references.some((r) => r.ruleId === kneeRule.id))
  assert(Boolean(kneeLimit?.priority === 'high' && kneeLimit.scenarioSpecific === true), 'Treatment sub-limit becomes a high-priority task')
  assert(Boolean(find(personal, 'room:eligible-category')?.priority === 'high'), 'Room task is high priority when Preflight shows a room deduction')
  assert(find(personal, 'preauth:planned')?.suggestedDueDate === '2026-11-08', 'Pre-auth due date = admission − 48 hours (2026-11-08)', find(personal, 'preauth:planned')?.suggestedDueDate)
  assert(find(personal, 'claim:submission-deadline')?.suggestedDueDate === '2026-12-14', 'Claim due date = admission + 4-day stay + 30 days (2026-12-14)', find(personal, 'claim:submission-deadline')?.suggestedDueDate)
  assert(!personal.some((t) => /cataract/i.test(t.title)), 'Cataract-only terms are not personalised for a knee replacement')

  // ─── 4. Real extracted sample policies ─────────────────────────────────
  console.log('\n4. Real extracted policy data (sample presets):')
  for (const [key, policy] of Object.entries(SAMPLE_POLICIES)) {
    const defs = generateChecklist({ rules: policy.rules, compiledRules: policy.compiled_rules, overview: policy.overview })
    assert(defs.length >= 5, `${key}: ${defs.length} tasks generated`)
    const ruleIds = new Set(policy.rules.map((r) => r.id))
    assert(defs.every((t) => t.references.every((r) => !r.ruleId || ruleIds.has(r.ruleId))), `${key}: every reference points to an extracted rule`)
    assert(getPolicyKey(policy).startsWith('sample:'), `${key}: stable sample policy key ${getPolicyKey(policy)}`)
  }
  const hdfc = SAMPLE_POLICIES.hdfc_optima
  assert(
    !generateChecklist({ rules: hdfc.rules }).some((t) => t.key.startsWith('cost:deductible')),
    'A zero deductible produces no "plan for the deductible" task',
  )
  assert(getPolicyKey({ ...SAMPLE_POLICIES.hdfc_optima, document_hash: 'a'.repeat(64) }) === `pdf:${'a'.repeat(64)}`, 'Uploaded PDFs are keyed by their SHA-256')

  // ─── 5. Risk alerts & progress ─────────────────────────────────────────
  console.log('\n5. Smart risk alerts and progress:')
  const tasks = asTasks(personal)
  const alerts = computeRiskAlerts(tasks)
  const pre = alerts.find((a) => a.type === 'pre_authorization' && a.taskKeys.includes('preauth:planned'))
  assert(pre?.title === 'Pre-authorization required by your policy' && pre.requirementLevel === 'policy_requirement', 'Pre-auth alert calls it required only because the clause says "must"')
  const waitAlert = alerts.find((a) => a.type === 'waiting_period')
  assert(!!waitAlert && waitAlert.title.includes('may') && !/required/i.test(waitAlert.title), 'Waiting-period alert is hedged ("may"), not stated as mandatory')
  assert(alerts.some((a) => a.type === 'room_rent'), 'Room-rent restriction alert')
  assert(alerts.some((a) => a.type === 'exclusion_or_limit'), 'Excluded / limited expense alert')
  const missing = alerts.find((a) => a.type === 'missing_documents')
  assert(!!missing && missing.taskKeys.length === 5, 'Missing-document alert lists the 5 policy-named documents', missing?.taskKeys)
  assert(alerts.some((a) => a.type === 'verification'), 'Unverified clauses raise a verification alert')
  assert(alerts.every((a) => a.nextAction.length > 10 && a.risk.length > 10), 'Every alert explains the risk and the next action')

  const done = tasks.map((t) => (t.key === 'preauth:planned' ? { ...t, status: 'completed' as const } : t))
  assert(!computeRiskAlerts(done).some((a) => a.taskKeys.includes('preauth:planned')), 'Completing a task clears its alert')
  const withDoc = tasks.map((t) => (t.key === 'doc:claim_form' ? { ...t, attachments: [{ id: '1', taskKey: t.key, fileName: 'f.pdf', mimeType: 'application/pdf', sizeBytes: 10, createdAt: '' }] } : t))
  assert(computeRiskAlerts(withDoc).find((a) => a.type === 'missing_documents')!.taskKeys.length === 4, 'Attaching a document removes it from the missing-documents alert')
  const prog = computeProgress(done)
  assert(prog.completed === 1 && prog.total === tasks.length && prog.percent === Math.round(100 / tasks.length), 'Progress counts completed vs total')

  // ─── 6. Persistence: sync, restore, update, regenerate ─────────────────
  console.log('\n6. Database persistence (repository contract):')
  const repo = new MemoryRepo()
  const alice = randomUUID()
  const bob = randomUUID()
  const policyKey = `pdf:${'b'.repeat(64)}`
  const created = await syncChecklist(repo, alice, {
    policyKey,
    insurer: 'Suraksha',
    planName: 'Family Health Shield',
    fileName: 'policy.pdf',
    scenario: SCENARIO,
    generation: { rules: RULES, compiledRules: COMPILED },
  })
  assert(created.tasks.length === personal.length - 0 || created.tasks.length > 10, `Checklist created with ${created.tasks.length} tasks`)
  assert(created.checklist.scenario?.treatment === SCENARIO.treatment, 'Scenario saved with the checklist')

  const updated = await updateTaskState(repo, alice, { checklistId: created.checklist.id, taskKey: 'preauth:planned', status: 'completed' })
  assert(updated.status === 'completed' && !!updated.completedAt, 'Task marked completed with timestamp')
  await updateTaskState(repo, alice, { checklistId: created.checklist.id, taskKey: 'doc:claim_form', dueDate: '2026-12-01' })
  const restored = await loadChecklist(repo, alice, policyKey)
  assert(find(restored!.tasks, 'preauth:planned').status === 'completed', 'Completion restored when the user returns')
  assert(find(restored!.tasks, 'doc:claim_form').dueDate === '2026-12-01', 'Due date restored')

  const reopened = await updateTaskState(repo, alice, { checklistId: created.checklist.id, taskKey: 'preauth:planned', status: 'pending' })
  assert(reopened.status === 'pending' && reopened.completedAt === null, 'Completed task can be reopened')
  await updateTaskState(repo, alice, { checklistId: created.checklist.id, taskKey: 'preauth:planned', status: 'completed' })

  await rejects(() => updateTaskState(repo, alice, { checklistId: created.checklist.id, taskKey: 'preauth:planned', status: 'done' }), (e) => e instanceof ChecklistInputError, 'Invalid status rejected')
  await rejects(() => updateTaskState(repo, alice, { checklistId: created.checklist.id, taskKey: 'doc:claim_form', dueDate: '01/12/2026' }), (e) => e instanceof ChecklistInputError, 'Invalid due date rejected')
  await rejects(() => syncChecklist(repo, alice, { policyKey: '../../etc', generation: { rules: RULES } }), (e) => e instanceof ChecklistInputError, 'Malformed policy key rejected')

  // Regenerate with a different treatment: progress kept, untouched scenario tasks removed
  const waitKey = created.tasks.find((t) => t.key.startsWith('wait:specific-illness'))!.key
  const kneeKey = created.tasks.find((t) => t.references.some((r) => r.ruleId === kneeRule.id))!.key
  await updateTaskState(repo, alice, { checklistId: created.checklist.id, taskKey: waitKey, status: 'completed' })
  const regen = await syncChecklist(repo, alice, {
    policyKey,
    scenario: { treatment: 'Appendectomy', proposedAdmissionDate: '2026-11-10', stayDurationDays: 2 },
    generation: { rules: RULES, compiledRules: COMPILED },
  })
  assert(find(regen.tasks, 'preauth:planned').status === 'completed', 'Regeneration keeps completed status')
  assert(find(regen.tasks, 'doc:claim_form').dueDate === '2026-12-01', 'Regeneration keeps user due dates')
  assert(find(regen.tasks, waitKey)?.stale === true && find(regen.tasks, waitKey).status === 'completed', 'Completed task no longer generated is kept and marked stale')
  assert(!find(regen.tasks, kneeKey), 'Untouched task no longer generated is removed')
  assert(find(regen.tasks, 'claim:submission-deadline').suggestedDueDate === '2026-12-12', 'Suggested dates recomputed for the new scenario')
  const keepScenario = await syncChecklist(repo, alice, { policyKey, generation: { rules: RULES, compiledRules: COMPILED } })
  assert(keepScenario.checklist.scenario?.treatment === 'Appendectomy', 'Omitting the scenario keeps the saved one')

  // ─── 7. Attachments ────────────────────────────────────────────────────
  console.log('\n7. Document attachments:')
  const pdfBytes = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF')
  const att = await addAttachment(repo, alice, { checklistId: created.checklist.id, taskKey: 'doc:discharge_summary', fileName: '../../Discharge Summary.pdf', bytes: pdfBytes })
  assert(att.mimeType === 'application/pdf' && att.fileName === 'Discharge Summary.pdf', 'PDF attached; path components stripped from the name', att)
  const stored = repo.attachments[0].storage_path
  assert(stored.startsWith(`${alice}/${created.checklist.id}/`), 'Stored under <user>/<checklist>/ (matches storage RLS policy)', stored)
  const afterAttach = await loadChecklist(repo, alice, policyKey)
  assert(find(afterAttach!.tasks, 'doc:discharge_summary').attachments.length === 1, 'Attachment status restored with the checklist')
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
  assert(detectAttachmentType(png) === 'image/png' && detectAttachmentType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])) === 'image/jpeg', 'PNG / JPEG detected from bytes')
  await rejects(() => addAttachment(repo, alice, { checklistId: created.checklist.id, taskKey: 'doc:claim_form', fileName: 'bill.pdf', bytes: new TextEncoder().encode('MZ\x90\x00 executable') }), (e) => e instanceof ChecklistInputError, 'Executable renamed to .pdf rejected (type from bytes)')
  await rejects(() => addAttachment(repo, alice, { checklistId: created.checklist.id, taskKey: 'doc:claim_form', fileName: 'big.pdf', bytes: new Uint8Array(10 * 1024 * 1024 + 1) }), (e) => e?.status === 413, 'Files over 10 MB rejected')
  await rejects(() => addAttachment(repo, alice, { checklistId: created.checklist.id, taskKey: 'no-such-task', fileName: 'a.pdf', bytes: pdfBytes }), (e) => e?.status === 404, 'Attaching to an unknown task rejected')
  const url = await attachmentDownloadUrl(repo, alice, att.id)
  assert(url.includes('expires=60'), 'Downloads use a 60-second signed URL')
  assert(safeFileName('C:\\fakepath\\bill<1>.pdf') === 'bill_1_.pdf', 'Unsafe characters removed from file names', safeFileName('C:\\fakepath\\bill<1>.pdf'))

  // ─── 8. Per-user isolation ─────────────────────────────────────────────
  console.log('\n8. Per-user isolation:')
  assert((await loadChecklist(repo, bob, policyKey)) === null, "Another user cannot load someone else's checklist")
  await rejects(() => updateTaskState(repo, bob, { checklistId: created.checklist.id, taskKey: 'preauth:planned', status: 'pending' }), (e) => e?.status === 404, "Another user cannot change someone else's task")
  await rejects(() => attachmentDownloadUrl(repo, bob, att.id), (e) => e?.status === 404, "Another user cannot download someone else's document")
  await rejects(() => addAttachment(repo, bob, { checklistId: created.checklist.id, taskKey: 'doc:claim_form', fileName: 'a.pdf', bytes: pdfBytes }), (e) => e?.status === 404, "Another user cannot attach to someone else's checklist")
  const bobList = await syncChecklist(repo, bob, { policyKey, generation: { rules: RULES } })
  assert(bobList.checklist.id !== created.checklist.id && bobList.tasks.every((t) => t.status === 'pending'), 'Same policy, different user → separate checklist')

  await removeAttachment(repo, alice, att.id)
  assert(repo.objects.size === 0 && repo.attachments.length === 0, 'Removing an attachment deletes the file and its record')

  // ─── 9. Device-only fallback & error mapping ───────────────────────────
  console.log('\n9. Fallback mode and error handling:')
  const local1 = applyLocalMerge(base, [])
  const local2 = applyLocalMerge(base, local1.map((t) => (t.key === 'preauth:planned' ? { ...t, status: 'completed' as const } : t)))
  assert(find(local2, 'preauth:planned').status === 'completed', 'Device-only mode keeps progress across regeneration')

  const fakeClient: any = {
    from: () => {
      const chain: any = new Proxy({}, { get: (_t, prop) => (prop === 'then' ? undefined : prop === 'maybeSingle' ? async () => ({ data: null, error: { code: 'PGRST205', message: 'missing' } }) : () => chain) })
      return chain
    },
  }
  await rejects(() => new SupabaseChecklistRepository(fakeClient).findChecklist(alice, policyKey), (e) => e instanceof ChecklistStorageUnavailableError, 'Missing tables (PGRST205) reported as storage unavailable')
  const res503 = toErrorResponse(new ChecklistStorageUnavailableError(), 'test')
  const body503 = await res503.json()
  assert(res503.status === 503 && body503.code === 'storage_unavailable', 'Storage-unavailable maps to 503 so the UI can fall back')
  const res500 = toErrorResponse(new Error('connection string postgres://secret'), 'test')
  assert(res500.status === 500 && !(await res500.json()).error.includes('secret'), 'Unexpected errors do not leak internals')
}

main()
  .catch((err) => {
    failures++
    console.error('❌ Test run crashed:', err)
  })
  .finally(() => {
    if (failures > 0) {
      console.error(`\n${failures} checklist test(s) failed.`)
      process.exit(1)
    }
    console.log('\n🎉 All checklist tests passed.')
    process.exit(0)
  })
