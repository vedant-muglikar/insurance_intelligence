'use client'

import React, { useEffect, useState } from 'react'
import { formatINR } from '@/lib/policy/normalizers'
import { ShieldCheck, AlertTriangle, ShieldAlert, Sparkles, TrendingUp } from 'lucide-react'

interface CoverageGaugeProps {
  totalCost: number
  coveredAmount: number
  patientShare: number
  status: string
  evidenceCoverage: number
}

export function CoverageGauge({
  totalCost,
  coveredAmount,
  patientShare,
  status,
  evidenceCoverage,
}: CoverageGaugeProps) {
  const [animProgress, setAnimProgress] = useState(0)

  const coveredRatio = totalCost > 0 ? Math.min(100, Math.max(0, Math.round((coveredAmount / totalCost) * 100))) : 0

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimProgress(coveredRatio)
    }, 100)
    return () => clearTimeout(timer)
  }, [coveredRatio])

  // SVG circular dimensions
  const size = 180
  const strokeWidth = 14
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (animProgress / 100) * circumference

  const isDenied = status === 'not_eligible' || coveredRatio === 0
  const isHighRisk = coveredRatio < 50 || isDenied
  const isSafe = coveredRatio >= 80 && !isDenied

  return (
    <div className="glass-panel rounded-2xl p-5 border border-slate-700/60 shadow-2xl relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6">
      {/* Background ambient aurora */}
      <div
        className={`aurora-bg w-64 h-64 -top-20 -left-20 opacity-30 ${
          isSafe ? 'bg-emerald-500' : isHighRisk ? 'bg-red-500' : 'bg-amber-500'
        }`}
      />

      {/* Radial Biometric Gauge Circle */}
      <div className="relative shrink-0 flex items-center justify-center">
        <svg width={size} height={size} className="transform -rotate-90">
          <defs>
            <linearGradient id="gaugeGradientEmerald" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#34d399" />
            </linearGradient>
            <linearGradient id="gaugeGradientAmber" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#fbbf24" />
            </linearGradient>
            <linearGradient id="gaugeGradientRed" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset="100%" stopColor="#f87171" />
            </linearGradient>
          </defs>

          {/* Track background */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={strokeWidth}
            fill="transparent"
          />

          {/* Animated active progress */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={isSafe ? 'url(#gaugeGradientEmerald)' : isHighRisk ? 'url(#gaugeGradientRed)' : 'url(#gaugeGradientAmber)'}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            style={{
              transition: 'stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          />
        </svg>

        {/* Center Readout */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] uppercase font-mono tracking-widest text-slate-400">
            Admissible
          </span>
          <div className="text-3xl font-extrabold text-white tracking-tight flex items-baseline">
            <span>{animProgress}</span>
            <span className="text-sm font-semibold text-emerald-400 ml-0.5">%</span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium mt-0.5">
            {isDenied ? 'Inadmissible' : 'Coverage Shield'}
          </span>
        </div>
      </div>

      {/* Middle: Diagnostic Health Status */}
      <div className="flex-1 space-y-3 text-left">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full border flex items-center gap-1.5 shadow-sm ${
              isSafe
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50'
                : isHighRisk
                ? 'bg-red-950/80 text-red-300 border-red-500/50'
                : 'bg-amber-950/80 text-amber-300 border-amber-500/50'
            }`}
          >
            {isSafe ? (
              <>
                <ShieldCheck size={14} className="text-emerald-400" />
                High Insurer Protection ({coveredRatio}%)
              </>
            ) : isHighRisk ? (
              <>
                <ShieldAlert size={14} className="text-red-400" />
                High Patient Out-of-Pocket Risk
              </>
            ) : (
              <>
                <AlertTriangle size={14} className="text-amber-400" />
                Moderate Out-of-Pocket Share ({100 - coveredRatio}%)
              </>
            )}
          </span>

          <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-800/80 border border-slate-700 text-slate-300 font-mono">
            {evidenceCoverage}% Verified Evidence
          </span>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          {isDenied
            ? 'This treatment is currently inadmissible under active policy waiting period or exclusion clauses.'
            : isSafe
            ? 'Excellent coverage profile. Policy limits and deductibles leave minimal out-of-pocket financial exposure for this procedure.'
            : 'Substantial deductions apply due to policy co-payments, room category limits, or treatment sub-limit ceilings.'}
        </p>

        {/* Mini Rupee Split Bars */}
        <div className="space-y-1.5 pt-1">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-emerald-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Insurer Pays: {formatINR(coveredAmount)}
            </span>
            <span className="text-amber-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              You Pay: {formatINR(patientShare)}
            </span>
          </div>

          {/* Segmented Bar */}
          <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden flex shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-1000 ease-out"
              style={{ width: `${animProgress}%` }}
            />
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-rose-400 transition-all duration-1000 ease-out"
              style={{ width: `${100 - animProgress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
