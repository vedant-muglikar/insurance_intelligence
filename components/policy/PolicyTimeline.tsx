'use client'

import React from 'react'
import { TimelineMilestone } from '@/lib/types/estimate'
import { formatDateIndian } from '@/lib/policy/normalizers'
import { Clock, CheckCircle2, AlertCircle, Calendar, ArrowRight, ShieldAlert } from 'lucide-react'

interface PolicyTimelineProps {
  milestones: TimelineMilestone[]
  policyStartDate?: string
  proposedAdmissionDate?: string
  onOpenEvidence?: (evidence: { page: number | null; quote: string; title: string }) => void
}

export function PolicyTimeline({
  milestones,
  policyStartDate,
  proposedAdmissionDate,
  onOpenEvidence,
}: PolicyTimelineProps) {
  if (!milestones || milestones.length === 0) return null

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
        <div>
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-400" />
            Policy Eligibility & Waiting Milestones
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Visual verification of whether your admission date satisfies statutory policy waiting milestones.
          </p>
        </div>

        <div className="text-right text-xs">
          <span className="text-slate-400 block">Planned Admission:</span>
          <span className="font-semibold text-emerald-400 font-mono">
            {formatDateIndian(proposedAdmissionDate)}
          </span>
        </div>
      </div>

      {!policyStartDate && (
        <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-500/30 text-xs text-amber-300 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
          <span>
            Policy start date has not been specified yet. Milestone completion dates below are provisional.
          </span>
        </div>
      )}

      {/* Timeline Steps */}
      <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
        {/* Inception Node */}
        <div className="relative flex items-start gap-4">
          <div className="absolute -left-6 mt-1 w-5 h-5 rounded-full bg-slate-900 border-2 border-blue-400 flex items-center justify-center">
            <Calendar className="w-2.5 h-2.5 text-blue-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white">Policy Inception Date</span>
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                Day 0
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {policyStartDate ? formatDateIndian(policyStartDate) : 'Date not provided'}
            </p>
          </div>
        </div>

        {/* Milestone Nodes */}
        {milestones.map((m) => {
          const isMet = m.status === 'met'
          const isActiveWait = m.status === 'active_wait'

          return (
            <div key={m.id} className="relative flex items-start gap-4">
              <div
                className={`absolute -left-6 mt-1 w-5 h-5 rounded-full flex items-center justify-center border-2 ${
                  isMet
                    ? 'bg-emerald-950 border-emerald-400 text-emerald-300'
                    : isActiveWait
                    ? 'bg-red-950 border-red-500 text-red-400'
                    : 'bg-slate-900 border-slate-600 text-slate-400'
                }`}
              >
                {isMet ? (
                  <CheckCircle2 className="w-3 h-3" />
                ) : (
                  <AlertCircle className="w-3 h-3" />
                )}
              </div>

              <div className="flex-1 p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-200">{m.title}</span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                      {m.durationText}
                    </span>
                  </div>

                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                      isMet
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : isActiveWait
                        ? 'bg-red-950 text-red-300 border border-red-800'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {isMet ? '✓ Milestone Cleared' : isActiveWait ? `⚠ Active Wait (${m.daysRemaining} days left)` : 'Pending Start Date'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-400 mt-2">
                  <span>Target Completion: <strong className="text-white font-mono">{formatDateIndian(m.targetDate)}</strong></span>
                  {m.ruleEvidence && onOpenEvidence && (
                    <button
                      onClick={() => onOpenEvidence({ page: m.ruleEvidence.page, quote: m.ruleEvidence.quote, title: m.ruleEvidence.ruleName })}
                      className="text-emerald-400 hover:underline flex items-center gap-1 text-[11px]"
                    >
                      Clause Evidence (p.{m.ruleEvidence.page ?? '—'})
                      <ArrowRight size={11} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
