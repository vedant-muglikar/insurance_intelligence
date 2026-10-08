'use client'

import React from 'react'
import { CoverageResult, TreatmentScenario } from '@/lib/types/estimate'
import { PolicyAnalysisResult } from '@/lib/types/policy'
import { formatINR, formatDateIndian } from '@/lib/policy/normalizers'
import { Download, Printer, Shield, CheckCircle, FileText, Scale } from 'lucide-react'

interface ExportSummaryProps {
  scenario: TreatmentScenario
  preflight: CoverageResult
  policy: PolicyAnalysisResult
}

export function ExportSummary({ scenario, preflight, policy }: ExportSummaryProps) {
  const handlePrint = () => {
    window.print()
  }

  const handleDownloadJSON = () => {
    const payload = {
      product: 'ClaimLens Pre-admission Preflight',
      timestamp: new Date().toISOString(),
      policy: {
        insurer: policy.overview.insurer,
        plan: policy.overview.plan_name,
        sumInsured: policy.overview.sum_insured,
      },
      scenario,
      preflightResult: {
        status: preflight.status,
        treatmentCost: preflight.treatmentCost,
        potentiallyCovered: preflight.potentiallyCovered,
        patientShare: preflight.patientShare,
        costSource: preflight.costSource,
        evidenceCoverage: `${preflight.evidenceCoverage}%`,
        confidence: preflight.confidence,
        ledger: preflight.ledger,
        missingInformation: preflight.missingInformation,
        assumptions: preflight.assumptions,
      },
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ClaimLens_Preflight_${scenario.treatment.replace(/\s+/g, '_')}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
        <div>
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Download className="w-4 h-4 text-emerald-400" />
            Preflight Summary & Export
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Download or print this verified, clause-audited pre-admission report for hospital counselling or family review.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadJSON}
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors"
          >
            <Download size={13} />
            Export JSON
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-1.5 transition-colors"
          >
            <Printer size={13} />
            Print Report
          </button>
        </div>
      </div>

      {/* Printable Sheet View */}
      <div className="p-5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs space-y-4 print:bg-white print:text-black print:border-none">
        <div className="flex justify-between items-start border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-lg font-bold text-white tracking-wide">
              CLAIM<span className="text-emerald-400">LENS</span> Pre-Admission Preflight
            </h2>
            <p className="text-[11px] text-slate-400">
              Policy-to-Patient Coverage & Treatment Cost Intelligence
            </p>
          </div>
          <div className="text-right text-[11px] text-slate-400">
            <span>Date: {formatDateIndian(new Date().toISOString())}</span>
            <p className="text-emerald-400 font-medium">Evidence Coverage: {preflight.evidenceCoverage}%</p>
          </div>
        </div>

        {/* Policy & Patient Header */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 rounded-lg bg-slate-900/60 border border-slate-800">
          <div>
            <span className="text-slate-500 block text-[10px] uppercase font-mono">Insurer & Plan</span>
            <strong className="text-white">{policy.overview.insurer || 'Insurer'}</strong>
            <p className="text-slate-400 text-[11px]">{policy.overview.plan_name}</p>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px] uppercase font-mono">Procedure & Room</span>
            <strong className="text-white">{scenario.treatment}</strong>
            <p className="text-slate-400 text-[11px] capitalize">{scenario.roomType} Room</p>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px] uppercase font-mono">Patient Profile</span>
            <strong className="text-white">Age: {scenario.age}</strong>
            <p className="text-slate-400 text-[11px]">
              {scenario.policyStartDate ? `Policy Start: ${formatDateIndian(scenario.policyStartDate)}` : 'Start Date Unknown'}
            </p>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px] uppercase font-mono">Preflight Status</span>
            <strong className="text-emerald-400 uppercase font-mono">{preflight.status.replace(/_/g, ' ')}</strong>
            <p className="text-slate-400 text-[11px]">Confidence: {preflight.confidence.toUpperCase()}</p>
          </div>
        </div>

        {/* Cost Ledger Summary Table */}
        <div>
          <span className="font-semibold text-slate-200 uppercase text-[11px] tracking-wider block mb-2">
            Clause-to-Rupee Deduction Ledger
          </span>
          <div className="border border-slate-800 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                <tr>
                  <th className="py-2 px-3">Item / Clause</th>
                  <th className="py-2 px-3">Category</th>
                  <th className="py-2 px-3">Calculation Formula</th>
                  <th className="py-2 px-3 text-right">Adjustment</th>
                  <th className="py-2 px-3 text-right">Admissible</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                <tr className="bg-slate-900/30">
                  <td className="py-2 px-3 font-semibold text-white">Gross Hospital Estimate</td>
                  <td className="py-2 px-3 text-slate-400">{preflight.costSource}</td>
                  <td className="py-2 px-3 text-slate-400">Hospital Quoted / Benchmark Tariff</td>
                  <td className="py-2 px-3 text-right text-slate-400">—</td>
                  <td className="py-2 px-3 text-right font-bold text-white font-mono">
                    {formatINR(preflight.treatmentCost.typical)}
                  </td>
                </tr>
                {preflight.ledger.map((line) => (
                  <tr key={line.id}>
                    <td className="py-2 px-3 text-slate-200">
                      <div>{line.ruleName}</div>
                      {line.evidence?.page && (
                        <span className="text-[10px] text-slate-500 font-mono">Clause p.{line.evidence.page}</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-slate-400 font-mono text-[10px] uppercase">{line.category}</td>
                    <td className="py-2 px-3 text-slate-400 text-[11px]">{line.calculation}</td>
                    <td className="py-2 px-3 text-right text-amber-400 font-semibold font-mono">
                      -{formatINR(line.deductionAmount)}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-300 font-mono">
                      {formatINR(line.coveredAmountAfter)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-emerald-950/20 font-bold border-t border-emerald-500/30">
                  <td colSpan={3} className="py-2.5 px-3 text-emerald-300 uppercase tracking-wide">
                    Net Insurer Admissible Preflight
                  </td>
                  <td colSpan={2} className="py-2.5 px-3 text-right text-emerald-400 font-mono text-sm">
                    {formatINR(preflight.potentiallyCovered.typical)}
                  </td>
                </tr>
                <tr className="bg-amber-950/20 font-bold">
                  <td colSpan={3} className="py-2.5 px-3 text-amber-300 uppercase tracking-wide">
                    Estimated Patient Out-of-Pocket Share
                  </td>
                  <td colSpan={2} className="py-2.5 px-3 text-right text-amber-400 font-mono text-sm">
                    {formatINR(preflight.patientShare.typical)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Disclaimer per blueprint */}
        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
          <strong>Important Preflight Notice:</strong> ClaimLens provides an explainable pre-admission preflight estimate based strictly on policy evidence clauses and scenario parameters. It does not constitute pre-authorization or claim guarantee; final authorization remains subject to insurer and Third Party Administrator (TPA) medical audit.
        </div>
      </div>
    </div>
  )
}
