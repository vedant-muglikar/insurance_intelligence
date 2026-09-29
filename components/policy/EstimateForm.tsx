'use client'

import React, { useState } from 'react'
import { PolicyAnalysisResult } from '@/lib/types/policy'
import { TreatmentScenario, EstimateResult } from '@/lib/types/estimate'
import { generateEstimate } from '@/lib/estimate'
import { Calculator, AlertCircle, Info, ChevronRight, IndianRupee } from 'lucide-react'

export function EstimateForm({ policyResult }: { policyResult: PolicyAnalysisResult }) {
  const [scenario, setScenario] = useState<TreatmentScenario>({
    treatment: '',
    age: 30,
    city: '',
    hospitalType: 'private',
    roomType: 'single-private',
    stayDurationDays: 1,
    quotedCost: undefined,
  })

  const [estimate, setEstimate] = useState<EstimateResult | null>(null)
  const [errors, setErrors] = useState<string[]>([])

  const handleCalculate = (e: React.FormEvent) => {
    e.preventDefault()
    setErrors([])
    const res = generateEstimate(scenario, policyResult)
    if (res.errors) {
      setErrors(res.errors)
    } else if (res.result) {
      setEstimate(res.result)
    }
  }

  const formatRupee = (num: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(num)
  }

  return (
    <div className="flex flex-col md:flex-row gap-6 p-4">
      {/* Form Sidebar */}
      <div className="w-full md:w-1/3 bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
        <h3 className="text-lg font-semibold text-[var(--text)] mb-4 flex items-center gap-2">
          <Calculator className="w-5 h-5 text-emerald-400" />
          Estimate Calculator
        </h3>
        <form onSubmit={handleCalculate} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Treatment / Procedure</label>
            <input 
              type="text" 
              required
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)]" 
              value={scenario.treatment} 
              onChange={e => setScenario({...scenario, treatment: e.target.value})}
              placeholder="e.g. Appendectomy, Cataract"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Patient Age</label>
              <input type="number" required min="1" className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)]" value={scenario.age} onChange={e => setScenario({...scenario, age: parseInt(e.target.value) || 0})} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">City</label>
              <input type="text" required className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)]" value={scenario.city} onChange={e => setScenario({...scenario, city: e.target.value})} placeholder="e.g. Mumbai" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
             <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Hospital</label>
              <select className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)]" value={scenario.hospitalType} onChange={e => setScenario({...scenario, hospitalType: e.target.value as any})}>
                <option value="public">Public / Govt</option>
                <option value="private">Private</option>
                <option value="corporate">Corporate</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Room Type</label>
              <select className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)]" value={scenario.roomType} onChange={e => setScenario({...scenario, roomType: e.target.value as any})}>
                <option value="general">General Ward</option>
                <option value="twin-sharing">Twin Sharing</option>
                <option value="single-private">Single Private</option>
                <option value="suite">Suite</option>
                <option value="icu">ICU</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Days in Hospital</label>
              <input type="number" required min="1" className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)]" value={scenario.stayDurationDays} onChange={e => setScenario({...scenario, stayDurationDays: parseInt(e.target.value) || 1})} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Quoted Cost (Opt)</label>
              <input type="number" min="0" className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)]" value={scenario.quotedCost || ''} onChange={e => setScenario({...scenario, quotedCost: parseInt(e.target.value) || undefined})} placeholder="₹" />
            </div>
          </div>

          {errors.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-lg text-xs">
              <ul className="list-disc pl-4 space-y-1">
                {errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors mt-4">
            Calculate Estimate
          </button>
        </form>
      </div>

      {/* Results Area */}
      <div className="w-full md:w-2/3 flex flex-col gap-4">
        {!estimate ? (
           <div className="h-full flex flex-col items-center justify-center text-slate-500 border border-[var(--border)] rounded-xl border-dashed bg-[var(--card2)] p-10">
             <Calculator className="w-10 h-10 mb-4 opacity-50" />
             <p>Fill in the scenario details and click Calculate to see your estimated out-of-pocket costs.</p>
           </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Total Treatment Cost</p>
                <div className="text-xl font-bold text-[var(--text)]">{formatRupee(estimate.coverage.estimatedCostRange[0])} – {formatRupee(estimate.coverage.estimatedCostRange[1])}</div>
                <p className="text-xs text-slate-500 mt-1">Typical: {formatRupee(estimate.coverage.typicalCost)}</p>
              </div>
              <div className="bg-[var(--card)] border border-emerald-500/30 bg-emerald-500/5 rounded-xl p-5">
                <p className="text-xs font-medium text-emerald-400 uppercase tracking-wider mb-2">Potentially Covered</p>
                <div className="text-xl font-bold text-emerald-400">{formatRupee(estimate.coverage.estimatedCoverageRange[0])} – {formatRupee(estimate.coverage.estimatedCoverageRange[1])}</div>
                {!estimate.policyEval.isCovered && <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded mt-1 inline-block">Not Covered</span>}
              </div>
              <div className="bg-[var(--card)] border border-amber-500/30 bg-amber-500/5 rounded-xl p-5">
                <p className="text-xs font-medium text-amber-400 uppercase tracking-wider mb-2">Out of Pocket (Est)</p>
                <div className="text-xl font-bold text-amber-400">{formatRupee(estimate.coverage.estimatedOutOfPocketRange[0])} – {formatRupee(estimate.coverage.estimatedOutOfPocketRange[1])}</div>
                <p className="text-xs text-slate-500 mt-1">You pay this</p>
              </div>
            </div>

            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 flex-1">
              <h4 className="font-semibold text-[var(--text)] mb-4">Calculation Breakdown & Reasons</h4>
              
              <div className="space-y-4">
                {estimate.policyEval.reasons.length > 0 && (
                  <div>
                    <h5 className="text-xs font-medium text-slate-400 mb-2">Policy Factors:</h5>
                    <ul className="space-y-1.5">
                      {estimate.policyEval.reasons.map((r, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-[var(--muted)]">
                           <ChevronRight className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                           {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                <div>
                    <h5 className="text-xs font-medium text-slate-400 mb-2">Typical Cost Deductions:</h5>
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 space-y-2 text-sm">
                       <div className="flex justify-between text-[var(--text)]"><span>Initial Typical Cost:</span> <span>{formatRupee(estimate.coverage.typicalCost + estimate.coverage.breakdown.coPayDeduction + estimate.coverage.breakdown.deductibleDeduction + estimate.coverage.breakdown.subLimitDeduction)}</span></div>
                       {estimate.coverage.breakdown.deductibleDeduction > 0 && <div className="flex justify-between text-amber-400"><span>- Deductible:</span> <span>{formatRupee(estimate.coverage.breakdown.deductibleDeduction)}</span></div>}
                       {estimate.coverage.breakdown.subLimitDeduction > 0 && <div className="flex justify-between text-amber-400"><span>- Sub-limit Exceeded:</span> <span>{formatRupee(estimate.coverage.breakdown.subLimitDeduction)}</span></div>}
                       {estimate.coverage.breakdown.coPayDeduction > 0 && <div className="flex justify-between text-amber-400"><span>- Co-pay ({estimate.policyEval.coPayPercentage}%):</span> <span>{formatRupee(estimate.coverage.breakdown.coPayDeduction)}</span></div>}
                       <div className="pt-2 border-t border-[var(--border)] flex justify-between font-medium text-emerald-400"><span>Estimated Coverage:</span> <span>{formatRupee(estimate.coverage.typicalCost)}</span></div>
                    </div>
                </div>

                <div className="mt-4 pt-4 border-t border-[var(--border)]">
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <Info className="w-3.5 h-3.5" /> Cost Confidence: <strong className="text-[var(--text)] capitalize">{estimate.confidence.costConfidence}</strong>
                    </span>
                    <span className="flex items-center gap-1">
                      <Info className="w-3.5 h-3.5" /> Coverage Confidence: <strong className="text-[var(--text)] capitalize">{estimate.confidence.coverageConfidence}</strong>
                    </span>
                  </div>
                  <div className="mt-2 space-y-1">
                     {estimate.confidence.reasons.map((r, i) => (
                        <p key={i} className="text-[11px] text-slate-500">• {r}</p>
                     ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
