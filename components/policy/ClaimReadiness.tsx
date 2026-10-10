'use client'

import React from 'react'
import { ClaimReadinessItem } from '@/lib/types/estimate'
import { CheckSquare, AlertCircle, FileCheck, HelpCircle, FileText, CheckCircle2 } from 'lucide-react'

interface ClaimReadinessProps {
  items: ClaimReadinessItem[]
  isNetworkHospital?: boolean
}

export function ClaimReadiness({ items, isNetworkHospital }: ClaimReadinessProps) {
  if (!items || items.length === 0) return null

  const getStatusBadge = (status: ClaimReadinessItem['status']) => {
    switch (status) {
      case 'available':
        return (
          <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
            <CheckCircle2 size={11} /> Ready
          </span>
        )
      case 'recommended':
        return (
          <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 flex items-center gap-1">
            <FileCheck size={11} /> Recommended
          </span>
        )
      case 'missing':
        return (
          <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 flex items-center gap-1">
            <AlertCircle size={11} /> Required
          </span>
        )
      default:
        return (
          <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-400">
            Optional
          </span>
        )
    }
  }

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
        <div>
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-emerald-400" />
            Pre-Authorization & Claim Readiness Checklist
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Checklist derived from your policy's extracted claim conditions and IRDAI pre-admission preflight rules.
          </p>
        </div>

        <span className="text-[11px] font-medium px-2.5 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700">
          Hospital: {isNetworkHospital ? 'In-Network (Cashless Candidate)' : 'Out-of-Network / Reimbursement'}
        </span>
      </div>

      <div className="space-y-2.5">
        {items.map((item) => (
          <div
            key={item.id}
            className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)] flex items-start justify-between gap-3 text-xs"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-200">{item.title}</span>
                <span className="text-[11px] uppercase text-slate-500">
                  {item.category.replace(/_/g, ' ')}
                </span>
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                {item.description}
              </p>
              {item.pageNumber && (
                <span className="text-[11px] text-slate-500 font-mono inline-block">
                  Policy Section: Page {item.pageNumber}
                </span>
              )}
            </div>

            <div className="shrink-0">
              {getStatusBadge(item.status)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
