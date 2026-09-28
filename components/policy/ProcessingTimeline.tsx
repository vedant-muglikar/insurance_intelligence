'use client'

import { useEffect, useState } from 'react'
import { Check, Sparkles, FileText, Cpu, ShieldCheck } from 'lucide-react'

interface ProcessingTimelineProps {
  fileName: string
}

const STEPS = [
  { label: 'Reading document bytes', detail: 'Extracting text layer and page structure with pdfjs' },
  { label: 'Normalizing clause syntax', detail: 'Tokenizing waiting periods, sub-limits, and exclusions' },
  { label: 'Deterministic rule compiler', detail: 'Building typed conditions, room limits, and co-pay predicates' },
  { label: 'Cross-verifying evidence citations', detail: 'Validating quotes against exact page character offsets' },
  { label: 'Calibrating preflight engine', detail: 'Linking hospital tariffs & pre-authorization readiness checklist' },
]

const SIMULATED_CLAUSES = [
  'Extracting: Section 1 (Sum Insured Ceiling)',
  'Parsing: Section 4.1 (24-Month Specific Illness Waiting)',
  'Compiling: Section 2.1 (Single Private Room Cap)',
  'Validating: Section 5.3 (Senior Citizen 20% Co-pay)',
  'Checking: Section 4.3 (Permanent Cosmetic Exclusions)',
  'Verifying: Citation Page 11 quote overlap > 85%',
  'Finalizing: Clause-to-Rupee audit ledger initialized',
]

export function ProcessingTimeline({ fileName }: ProcessingTimelineProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [clauseIndex, setClauseIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep((s) => {
        if (s < STEPS.length - 1) return s + 1
        return s
      })
    }, 1800)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const ticker = setInterval(() => {
      setClauseIndex((i) => (i + 1) % SIMULATED_CLAUSES.length)
    }, 900)
    return () => clearInterval(ticker)
  }, [])

  const progressPct = Math.round(((currentStep + 1) / STEPS.length) * 100)

  return (
    <div className="processing-wrapper relative overflow-hidden flex items-center justify-center min-h-[85vh] p-4">
      {/* Ambient glowing aurora circles */}
      <div className="aurora-bg w-96 h-96 -top-20 -left-20 bg-emerald-500/20" />
      <div className="aurora-bg w-96 h-96 -bottom-20 -right-20 bg-cyan-500/20" />

      <div className="processing-card glass-panel relative z-10 max-w-xl w-full p-6 sm:p-8 rounded-2xl border border-slate-700/60 shadow-2xl space-y-6">
        {/* Animated laser scanline sweeping across */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
          <div className="w-full h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent opacity-40 animate-[scanline_3s_ease-in-out_infinite]" />
        </div>

        {/* Header with Orbital Ring */}
        <div className="flex items-center gap-4">
          <div className="relative flex items-center justify-center shrink-0">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-slate-950 shadow-lg shadow-emerald-950 animate-pulse">
              <Cpu size={24} />
            </div>
            {/* Spinning orbital border ring */}
            <div className="absolute -inset-1 rounded-xl border border-emerald-400/40 animate-spin opacity-50" style={{ animationDuration: '8s' }} />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white tracking-tight">ClaimLens Policy Engine</h2>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                Compiling
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono truncate max-w-xs sm:max-w-sm mt-0.5">
              {fileName}
            </p>
          </div>
        </div>

        {/* Progress Bar & Percentage */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400 font-medium">Deterministic Rule Compilation</span>
            <span className="text-emerald-400 font-bold font-mono">{progressPct}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden border border-slate-800">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 transition-all duration-500 ease-out shadow-sm shadow-emerald-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Active Clause Scanning HUD Ticker */}
        <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 flex items-center gap-2.5 text-[11px] font-mono">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
          <span className="text-slate-500 shrink-0">SCANNING:</span>
          <span className="text-emerald-300 truncate">
            {SIMULATED_CLAUSES[clauseIndex]}
          </span>
        </div>

        {/* Steps Timeline */}
        <div className="space-y-3 pt-1">
          {STEPS.map((step, idx) => {
            const done = idx < currentStep
            const active = idx === currentStep

            return (
              <div key={step.label} className="flex items-start gap-3 text-xs">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                    done
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-600'
                      : active
                      ? 'bg-emerald-500 text-slate-950 font-bold animate-pulse'
                      : 'bg-slate-900 text-slate-600 border border-slate-800'
                  }`}
                >
                  {done ? <Check size={12} strokeWidth={3} /> : idx + 1}
                </span>

                <div className="space-y-0.5">
                  <div
                    className={`font-semibold ${
                      done
                        ? 'text-slate-300'
                        : active
                        ? 'text-white'
                        : 'text-slate-500'
                    }`}
                  >
                    {step.label}
                  </div>
                  {active && (
                    <div className="text-[11px] text-emerald-400/90 animate-in fade-in duration-300">
                      {step.detail}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <p className="text-[11px] text-center text-slate-500 pt-2 border-t border-slate-800">
          Generating auditable Clause-to-Rupee ledger. Please keep this tab open.
        </p>
      </div>
    </div>
  )
}
