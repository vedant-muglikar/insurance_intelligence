'use client'

import { useRef, useState } from 'react'
import {
  AlertTriangle,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Loader2,
  Paperclip,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react'
import type { PolicyRule } from '@/lib/types/policy'
import type { ChecklistPriority, ChecklistTask, RequirementLevel } from '@/lib/types/checklist'
import { effectiveDueDate } from '@/lib/checklist/state'
import { ATTACHMENT_ACCEPT, MAX_ATTACHMENT_BYTES, formatBytes } from '@/lib/checklist/attachments'
import { formatDateIndian } from '@/lib/policy/normalizers'

const PRIORITY_STYLE: Record<ChecklistPriority, { label: string; color: string }> = {
  high: { label: 'High', color: 'var(--deny)' },
  medium: { label: 'Medium', color: 'var(--warn)' },
  low: { label: 'Low', color: 'var(--subtle)' },
}

export const REQUIREMENT_STYLE: Record<RequirementLevel, { label: string; color: string; hint: string }> = {
  policy_requirement: {
    label: 'Policy requirement',
    color: 'var(--info)',
    hint: 'The cited clause itself uses obligation wording (must / shall / required).',
  },
  policy_term: {
    label: 'Policy term',
    color: 'var(--plum)',
    hint: 'Derived from a policy clause (limit, waiting period, exclusion, condition).',
  },
  recommendation: {
    label: 'Recommendation',
    color: 'var(--subtle)',
    hint: 'General good practice — not taken from your policy wording.',
  },
}

export function Pill({ color, children, title }: { color: string; children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap border"
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
      }}
    >
      {children}
    </span>
  )
}

function todayIso() {
  return new Date().toISOString().split('T')[0]
}

interface ChecklistTaskItemProps {
  task: ChecklistTask
  expanded: boolean
  onToggleExpanded: () => void
  onSetStatus: (status: ChecklistTask['status']) => void
  onSetDueDate: (date: string | null) => void
  onUpload: (file: File) => void
  onDeleteAttachment: (attachmentId: string) => void
  onViewClause?: (rule: PolicyRule) => void
  rulesById: Map<string, PolicyRule>
  busy: boolean
  attachmentsEnabled: boolean
  attachmentsDisabledReason?: string
}

export function ChecklistTaskItem({
  task,
  expanded,
  onToggleExpanded,
  onSetStatus,
  onSetDueDate,
  onUpload,
  onDeleteAttachment,
  onViewClause,
  rulesById,
  busy,
  attachmentsEnabled,
  attachmentsDisabledReason,
}: ChecklistTaskItemProps) {
  const done = task.status === 'completed'
  const due = effectiveDueDate(task)
  const overdue = !done && !!due && due < todayIso()
  const missingDoc = !!task.documentType && task.attachments.length === 0 && !done
  const fileInput = useRef<HTMLInputElement>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const detailsId = `task-details-${task.key.replace(/[^a-z0-9]/gi, '-')}`

  const pickFile = (file: File | undefined) => {
    setFileError(null)
    if (!file) return
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setFileError('Files must be 10 MB or smaller.')
      return
    }
    onUpload(file)
  }

  return (
    <li
      id={`task-${task.key}`}
      className="rounded-[var(--radius)] border bg-[var(--card)] transition-colors"
      style={{
        borderColor:
          task.priority === 'high' && !done
            ? 'color-mix(in srgb, var(--deny) 40%, var(--border))'
            : 'var(--border)',
        opacity: task.stale ? 0.75 : 1,
      }}
    >
      <div className="flex items-start gap-3 p-3 sm:p-4">
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={done ? `Mark “${task.title}” as pending` : `Mark “${task.title}” as completed`}
          disabled={busy}
          onClick={() => onSetStatus(done ? 'pending' : 'completed')}
          className="mt-0.5 h-5 w-5 shrink-0 rounded-[5px] border flex items-center justify-center transition-colors disabled:opacity-60"
          style={{
            borderColor: done ? 'var(--ok)' : 'var(--border3)',
            background: done ? 'var(--ok)' : 'transparent',
            color: 'var(--on-brand)',
          }}
        >
          {busy ? <Loader2 size={12} className="animate-spin text-[var(--muted)]" /> : done && <Check size={13} strokeWidth={3} />}
        </button>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onToggleExpanded}
            aria-expanded={expanded}
            aria-controls={detailsId}
            className="w-full text-left flex items-start justify-between gap-2"
          >
            <span
              className={`text-sm font-medium leading-snug ${done ? 'line-through text-[var(--subtle)]' : 'text-[var(--text)]'}`}
            >
              {task.title}
            </span>
            {expanded ? (
              <ChevronDown size={16} className="shrink-0 mt-0.5 text-[var(--subtle)]" />
            ) : (
              <ChevronRight size={16} className="shrink-0 mt-0.5 text-[var(--subtle)]" />
            )}
          </button>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Pill color={PRIORITY_STYLE[task.priority].color}>
              {task.priority === 'high' && <AlertTriangle size={10} />}
              {PRIORITY_STYLE[task.priority].label} priority
            </Pill>
            <Pill color={REQUIREMENT_STYLE[task.requirementLevel].color} title={REQUIREMENT_STYLE[task.requirementLevel].hint}>
              {REQUIREMENT_STYLE[task.requirementLevel].label}
            </Pill>
            {task.needsVerification && (
              <Pill color="var(--warn)" title={task.verificationNote}>
                Verify
              </Pill>
            )}
            {task.scenarioSpecific && <Pill color="var(--ok)">Your scenario</Pill>}
            {due && (
              <Pill color={overdue ? 'var(--deny)' : 'var(--muted)'} title={task.dueDate ? 'Your due date' : task.dueDateBasis}>
                <Calendar size={10} />
                {overdue ? 'Overdue · ' : task.dueDate ? 'Due ' : 'Suggested '}
                {formatDateIndian(due)}
              </Pill>
            )}
            {task.documentType && (
              <Pill color={missingDoc ? 'var(--warn)' : 'var(--ok)'}>
                <Paperclip size={10} />
                {task.attachments.length > 0 ? `${task.attachments.length} attached` : 'Document missing'}
              </Pill>
            )}
            {task.stale && <Pill color="var(--subtle)">From an earlier scenario</Pill>}
          </div>

          {expanded && (
            <div id={detailsId} className="mt-3 space-y-3 text-[13px] leading-relaxed">
              <p className="text-[var(--muted)]">{task.explanation}</p>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[var(--radius-sm)] bg-[var(--surface)] border border-[var(--border)] p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--subtle)]">Why it matters</div>
                  <p className="mt-1 text-[var(--text)]">{task.whyItMatters}</p>
                </div>
                <div className="rounded-[var(--radius-sm)] bg-[var(--surface)] border border-[var(--border)] p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--subtle)]">Recommended action</div>
                  <p className="mt-1 text-[var(--text)]">{task.recommendedAction}</p>
                </div>
              </div>

              {task.needsVerification && task.verificationNote && (
                <div
                  className="flex gap-2 rounded-[var(--radius-sm)] p-3 text-[var(--text)]"
                  style={{ background: 'color-mix(in srgb, var(--warn) 9%, transparent)' }}
                >
                  <AlertTriangle size={14} className="shrink-0 mt-0.5 text-[var(--warn)]" />
                  <span>{task.verificationNote}</span>
                </div>
              )}

              {task.references.length > 0 ? (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--subtle)]">Policy source</div>
                  <ul className="mt-1.5 space-y-2">
                    {task.references.map((ref, i) => {
                      const rule = ref.ruleId ? rulesById.get(ref.ruleId) : undefined
                      return (
                        <li key={i} className="rounded-[var(--radius-sm)] border border-[var(--border)] p-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--subtle)]">
                            <span className="font-mono">
                              {ref.page ? `Page ${ref.page}` : 'Page not cited'}
                              {ref.section ? ` · ${ref.section}` : ''}
                              {' · '}
                              <span style={{ color: ref.verified ? 'var(--ok)' : 'var(--warn)' }}>
                                {ref.verified ? 'quote verified on page' : 'quote not verified'}
                              </span>
                            </span>
                            {rule && onViewClause && (
                              <button type="button" className="font-medium text-[var(--brand)] hover:underline" onClick={() => onViewClause(rule)}>
                                View clause
                              </button>
                            )}
                          </div>
                          <blockquote className="mt-1 text-[12px] italic text-[var(--muted)]">“{ref.quote}”</blockquote>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : (
                <p className="text-[12px] text-[var(--subtle)]">
                  No policy clause is cited — this is a general recommendation, not a policy requirement.
                </p>
              )}

              {/* Due date */}
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-[12px] text-[var(--subtle)]" htmlFor={`${detailsId}-due`}>
                  Due date (optional)
                </label>
                <input
                  id={`${detailsId}-due`}
                  type="date"
                  value={task.dueDate ?? ''}
                  onChange={(e) => onSetDueDate(e.target.value || null)}
                  className="rounded-[var(--radius-sm)] border border-[var(--border2)] bg-[var(--surface)] px-2 py-1 text-[12px] text-[var(--text)]"
                />
                {task.dueDate && (
                  <button type="button" className="text-[12px] text-[var(--subtle)] hover:text-[var(--text)]" onClick={() => onSetDueDate(null)}>
                    Clear
                  </button>
                )}
                {!task.dueDate && task.suggestedDueDate && (
                  <span className="text-[11px] text-[var(--subtle)]">
                    Suggested {formatDateIndian(task.suggestedDueDate)} — {task.dueDateBasis}
                  </span>
                )}
              </div>

              {/* Attachments */}
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--subtle)]">
                  Supporting documents
                </div>
                {task.attachments.length > 0 && (
                  <ul className="mt-1.5 space-y-1.5">
                    {task.attachments.map((a) => (
                      <li key={a.id} className="flex items-center gap-2 text-[12px]">
                        <FileText size={13} className="shrink-0 text-[var(--subtle)]" />
                        <a
                          href={`/api/checklist/attachments/${a.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-w-0 truncate text-[var(--text)] hover:underline"
                        >
                          {a.fileName}
                        </a>
                        <span className="shrink-0 text-[var(--subtle)]">{formatBytes(a.sizeBytes)}</span>
                        <ExternalLink size={11} className="shrink-0 text-[var(--subtle)]" />
                        <button
                          type="button"
                          aria-label={`Remove ${a.fileName}`}
                          disabled={busy}
                          onClick={() => onDeleteAttachment(a.id)}
                          className="ml-auto shrink-0 p-1 text-[var(--subtle)] hover:text-[var(--deny)] disabled:opacity-50"
                        >
                          <Trash2 size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {missingDoc && (
                  <p className="mt-1 text-[12px] text-[var(--warn)]">Reminder: no copy attached yet.</p>
                )}
                {attachmentsEnabled ? (
                  <div className="mt-2">
                    <input
                      ref={fileInput}
                      type="file"
                      accept={ATTACHMENT_ACCEPT}
                      className="hidden"
                      onChange={(e) => {
                        pickFile(e.target.files?.[0])
                        e.target.value = ''
                      }}
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => fileInput.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border2)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--text)] hover:border-[var(--border3)] disabled:opacity-50"
                    >
                      {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                      Attach document
                    </button>
                    <span className="ml-2 text-[11px] text-[var(--subtle)]">PDF, JPEG, PNG or WebP · max 10 MB</span>
                    {fileError && <p className="mt-1 text-[12px] text-[var(--deny)]">{fileError}</p>}
                  </div>
                ) : (
                  <p className="mt-1 text-[12px] text-[var(--subtle)]">{attachmentsDisabledReason}</p>
                )}
              </div>

              {done && (
                <button
                  type="button"
                  onClick={() => onSetStatus('pending')}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--muted)] hover:text-[var(--text)]"
                >
                  <RotateCcw size={13} /> Reopen task
                  {task.completedAt && (
                    <span className="font-normal text-[var(--subtle)]">· completed {formatDateIndian(task.completedAt)}</span>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}
