'use client'

import React, { useState } from 'react'
import { DeductionLine } from '@/lib/types/estimate'
import { formatINR } from '@/lib/policy/normalizers'
import { ArrowDown, CheckCircle2, ChevronRight, FileText, Info } from 'lucide-react'

interface ClauseFlowVisualizerProps {
  totalCost: number
  coveredAmount: number
  patientShare: number
  ledger: DeductionLine[]
  onSelectRule?: (line: DeductionLine) => void
}

export function ClauseFlowVisualizer({
  totalCost,
  coveredAmount,
  patientShare,
  ledger,
  onSelectRule,
}: ClauseFlowVisualizerProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  return (
    <div className="glass-panel rounded-2xl p-5 border border-slate-700/60 shadow-xl space-y-4 relative overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h4 className="text-sm font-semibold text-white flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
            Interactive Money Flow: Policy Filtration Pipeline
          </h4>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Visualize how your hospital estimate passes through each policy clause filter to arrive at the final payable amount.
          </p>
        </div>
        <span className="text-[11px] uppercase px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800">
          Flow Pipeline
        </span>
      </div>

      {/* Horizontal / Vertical Pipeline on larger screens */}
      <div className="overflow-x-auto pb-2">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 md:min-w-[650px] relative py-2">
          {/* Node 1: Gross Estimate */}
          <div className="w-full md:w-44 p-3 rounded-xl bg-slate-900 border border-slate-700/80 text-center shadow-lg relative shrink-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              1. Gross Estimate
            </span>
            <div className="text-sm font-bold text-white mt-1">
              {formatINR(totalCost)}
            </div>
            <span className="text-[11px] text-slate-500 block mt-0.5">Quoted / Benchmark</span>
          </div>

          {/* Flow Arrow */}
          <div className="hidden md:flex items-center text-slate-600 shrink-0">
            <svg width="28" height="12" viewBox="0 0 28 12" className="overflow-visible">
              <line x1="0" y1="6" x2="22" y2="6" style={{ stroke: 'var(--ok)' }} strokeWidth="2" className="flow-pipe" />
              <polygon points="22,2 28,6 22,10" style={{ fill: 'var(--ok)' }} />
            </svg>
          </div>

          {/* Node 2: Deductions Cluster */}
          {ledger.length > 0 ? (
            <div className="flex-1 flex flex-wrap md:flex-nowrap gap-2 items-center justify-center">
              {ledger.map((line, idx) => {
                const isSelected = selectedNodeId === line.id
                return (
                  <div
                    key={line.id}
                    onClick={() => {
                      setSelectedNodeId(isSelected ? null : line.id)
                      if (onSelectRule) onSelectRule(line)
                    }}
                    className={`cursor-pointer p-2.5 rounded-xl border transition-all text-center flex-1 min-w-[120px] interactive-card ${
                      isSelected
                        ? 'bg-amber-950/80 border-amber-400 shadow-lg shadow-amber-950/50'
                        : 'bg-slate-900/90 border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <span className="text-[11px] uppercase text-slate-400 block truncate">
                      {line.ruleType.replace(/_/g, ' ')}
                    </span>
                    <div className="text-xs font-bold text-amber-400 mt-0.5">
                      -{formatINR(line.deductionAmount)}
                    </div>
                    <span className="text-[11px] text-slate-400 block truncate mt-0.5" title={line.ruleName}>
                      {line.ruleName}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex-1 p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-center text-xs text-emerald-300">
              ✓ Zero policy deductions triggered
            </div>
          )}

          {/* Flow Arrow */}
          <div className="hidden md:flex items-center text-slate-600 shrink-0">
            <svg width="28" height="12" viewBox="0 0 28 12" className="overflow-visible">
              <line x1="0" y1="6" x2="22" y2="6" style={{ stroke: 'var(--ok)' }} strokeWidth="2" className="flow-pipe" />
              <polygon points="22,2 28,6 22,10" style={{ fill: 'var(--ok)' }} />
            </svg>
          </div>

          {/* Final Outputs: Insurer vs Patient */}
          <div className="flex gap-2 w-full md:w-auto shrink-0">
            {/* Insurer Share */}
            <div className="flex-1 md:w-36 p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/50 text-center shadow-lg">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 block">
                Insurer Pays
              </span>
              <div className="text-sm font-bold text-emerald-300 mt-1">
                {formatINR(coveredAmount)}
              </div>
              <span className="text-[11px] text-slate-400 block mt-0.5">Admissible</span>
            </div>

            {/* Patient Share */}
            <div className="flex-1 md:w-36 p-3 rounded-xl bg-gradient-to-b from-amber-950/40 to-slate-900 border border-amber-500/50 text-center shadow-lg">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 block">
                Patient Share
              </span>
              <div className="text-sm font-bold text-amber-300 mt-1">
                {formatINR(patientShare)}
              </div>
              <span className="text-[11px] text-slate-400 block mt-0.5">Out of Pocket</span>
            </div>
          </div>
        </div>
      </div>

      {/* Selected Node Drawer / Info Pill */}
      {selectedNodeId && (() => {
        const item = ledger.find(l => l.id === selectedNodeId)
        if (!item) return null
        return (
          <div className="p-3 rounded-xl bg-slate-900/90 border border-amber-500/40 flex items-start justify-between gap-3 text-xs animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-amber-300">{item.ruleName}</span>
                <span className="text-[11px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 uppercase">
                  {item.category}
                </span>
                <span className="text-amber-400 font-bold">-{formatINR(item.deductionAmount)}</span>
              </div>
              <p className="text-slate-300 text-[11px]">{item.calculation}</p>
              {item.evidence?.quote && (
                <blockquote className="text-slate-400 italic text-[11px] mt-1">
                  "{item.evidence.quote}" {item.evidence.page ? `(p.${item.evidence.page})` : ''}
                </blockquote>
              )}
            </div>
            <button
              onClick={() => setSelectedNodeId(null)}
              className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded bg-slate-800"
            >
              Close
            </button>
          </div>
        )
      })()}
    </div>
  )
}
