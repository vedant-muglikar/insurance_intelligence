'use client'

import React, { useState } from 'react'
import { DeductionLine } from '@/lib/types/estimate'
import { formatINR } from '@/lib/policy/normalizers'
import {
  FileText,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  ShieldCheck,
  Info,
  Scale,
  Percent,
  Bed,
  MinusCircle,
} from 'lucide-react'

interface CostLedgerProps {
  totalCost: number
  coveredAmount: number
  patientShare: number
  costSource: string
  ledger: DeductionLine[]
  onOpenEvidence?: (evidence: { page: number | null; section?: string; quote: string; title: string }) => void
}

export function CostLedger({
  totalCost,
  coveredAmount,
  patientShare,
  costSource,
  ledger,
  onOpenEvidence,
}: CostLedgerProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const toggleExpand = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id))
  }

  const getRuleIcon = (type: string) => {
    switch (type) {
      case 'ROOM_LIMIT':
        return <Bed className="w-4 h-4 text-amber-400" />
      case 'COPAY':
        return <Percent className="w-4 h-4 text-purple-400" />
      case 'DEDUCTIBLE':
        return <Scale className="w-4 h-4 text-blue-400" />
      case 'SUB_LIMIT':
        return <MinusCircle className="w-4 h-4 text-orange-400" />
      case 'EXCLUSION':
      case 'WAITING_PERIOD':
        return <AlertTriangle className="w-4 h-4 text-red-400" />
      default:
        return <Info className="w-4 h-4 text-cyan-400" />
    }
  }

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
        <div>
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Scale className="w-4 h-4 text-emerald-400" />
            Clause-to-Rupee Audit Ledger
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Every rupee adjustment traced from hospital line item to verified policy clause.
          </p>
        </div>
        <span className="text-[11px] font-medium px-2.5 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700">
          Source: {costSource.replace(/_/g, ' ')}
        </span>
      </div>

      {/* Starting bill summary */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
        <div>
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            Total Quoted / Benchmark Expense
          </span>
          <p className="text-xs text-slate-500">Gross inpatient hospitalization estimate</p>
        </div>
        <div className="text-lg font-bold text-white">
          {formatINR(totalCost)}
        </div>
      </div>

      {/* Deductions breakdown */}
      {ledger.length === 0 ? (
        <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>No policy deductions or sub-limit caps triggered for this scenario. Full estimated expense is eligible.</span>
        </div>
      ) : (
        <div className="space-y-2">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block px-1">
            Policy Deductions & Adjustments ({ledger.length})
          </span>

          {ledger.map((line) => {
            const isExpanded = expandedId === line.id
            const isDenial = line.impact === 'denial'

            return (
              <div
                key={line.id}
                className={`border rounded-lg transition-all ${
                  isDenial
                    ? 'border-red-500/40 bg-red-950/20'
                    : 'border-[var(--border)] bg-[var(--surface)] hover:border-slate-600'
                }`}
              >
                <div
                  className="flex items-center justify-between p-3 cursor-pointer select-none"
                  onClick={() => toggleExpand(line.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded bg-slate-800/80 border border-slate-700">
                      {getRuleIcon(line.ruleType)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-200">
                          {line.ruleName}
                        </span>
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 uppercase">
                          {line.category}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">
                        {line.calculation}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className={`text-sm font-bold ${isDenial ? 'text-red-400' : 'text-amber-400'}`}>
                        -{formatINR(line.deductionAmount)}
                      </div>
                      <span className="text-[11px] text-slate-500">
                        Remaining: {formatINR(line.coveredAmountAfter)}
                      </span>
                    </div>
                    <button className="text-slate-400 hover:text-white p-1">
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                </div>

                {/* Expanded Clause Evidence Details */}
                {isExpanded && (
                  <div className="p-3.5 border-t border-[var(--border)] bg-slate-950/40 space-y-2.5 text-xs">
                    <div>
                      <span className="text-slate-400 font-medium">Calculation Rule:</span>
                      <p className="text-slate-200 mt-0.5">{line.calculation}</p>
                    </div>

                    {line.evidence && line.evidence.quote && (
                      <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1.5">
                            <FileText size={12} />
                            Policy Evidence Clause
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {line.evidence.page !== null ? `Page ${line.evidence.page}` : 'Document Quote'}
                            {line.evidence.section ? ` · ${line.evidence.section}` : ''}
                          </span>
                        </div>
                        <blockquote className="text-slate-300 italic text-[11px] leading-relaxed">
                          "{line.evidence.quote}"
                        </blockquote>
                      </div>
                    )}

                    {onOpenEvidence && line.evidence && line.evidence.quote && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpenEvidence({
                            page: line.evidence.page,
                            section: line.evidence.section,
                            quote: line.evidence.quote,
                            title: line.ruleName,
                          })
                        }}
                        className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1 font-medium"
                      >
                        Inspect Full Clause Context →
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Final Preflight Split */}
      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[var(--border)]">
        <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/30">
          <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider block">
            Potentially Covered By Insurer
          </span>
          <div className="text-xl font-bold text-emerald-300 mt-1">
            {formatINR(coveredAmount)}
          </div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">
            {totalCost > 0 ? `${Math.round((coveredAmount / totalCost) * 100)}% of total cost` : '—'}
          </span>
        </div>

        <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-500/30">
          <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider block">
            Estimated Patient Share (Out of Pocket)
          </span>
          <div className="text-xl font-bold text-amber-300 mt-1">
            {formatINR(patientShare)}
          </div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">
            {totalCost > 0 ? `${Math.round((patientShare / totalCost) * 100)}% of total cost` : '—'}
          </span>
        </div>
      </div>
    </div>
  )
}
