'use client'

import React, { useState, useEffect, useRef } from 'react'
import { PolicyAnalysisResult, PolicyRule } from '@/lib/types/policy'
import {
  TreatmentScenario,
  CoverageResult,
  QuoteLineItem,
} from '@/lib/types/estimate'
import { evaluatePolicyPreflight } from '@/lib/estimate/policy'
import { fetchMlCostPrediction, scenarioNeedsMlCost } from '@/lib/estimate/mlClient'
import { CANONICAL_PROCEDURES, formatINR } from '@/lib/policy/normalizers'
import { CostLedger } from './CostLedger'
import { MissingInfoPanel } from './MissingInfoPanel'
import { WhatIfPanel } from './WhatIfPanel'
import { PolicyTimeline } from './PolicyTimeline'
import { ClaimReadiness } from './ClaimReadiness'
import { QuoteReview } from './QuoteReview'
import { ExportSummary } from './ExportSummary'
import { ClauseFlowVisualizer } from './ClauseFlowVisualizer'
import { CoverageRiskAnalyzer } from './CoverageRiskAnalyzer'
import { EvidenceViewer } from './shared'
import {
  Calculator,
  AlertCircle,
  Clock,
  Sparkles,
  FileText,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  CheckSquare,
  Download,
  Upload,
  Calendar,
  Building2,
  Bed,
  User,
  ShieldCheck,
  ShieldAlert,
  ChevronRight,
  RotateCcw,
} from 'lucide-react'

interface EstimateFormProps {
  policyResult: PolicyAnalysisResult
  /** Restores the scenario when the user returns to this tab */
  initialScenario?: TreatmentScenario | null
  /** Reports each evaluated scenario; `userEdited` is false while the placeholder defaults are untouched */
  onPreflightChange?: (scenario: TreatmentScenario, preflight: CoverageResult, userEdited: boolean) => void
}

export function EstimateForm({ policyResult, initialScenario, onPreflightChange }: EstimateFormProps) {
  // Default scenario initialized with smart defaults
  const [scenario, setScenario] = useState<TreatmentScenario>(() => initialScenario ?? {
    treatment: 'Total Knee Replacement',
    age: 58,
    city: 'Mumbai',
    hospitalType: 'private',
    roomType: 'single-private',
    stayDurationDays: 4,
    policyStartDate: '2023-01-15',
    proposedAdmissionDate: new Date().toISOString().split('T')[0],
    declaredPED: [],
    // Taken from the policy document; left empty (the form asks) when the PDF does not state one clearly.
    availableSumInsured: policyResult.overview.sum_insured_amount ?? undefined,
    isNetworkHospital: true,
  })

  const [activePreflightTab, setActivePreflightTab] = useState<
    'ledger' | 'missing_info' | 'what_if' | 'timeline' | 'readiness' | 'quote' | 'export' | 'risk_analyzer'
  >('ledger')

  const [preflight, setPreflight] = useState<CoverageResult | null>(null)
  const [activeEvidenceModal, setActiveEvidenceModal] = useState<PolicyRule | null>(null)
  const [showQuoteModal, setShowQuoteModal] = useState(false)

  // Any user edit replaces the scenario object, so identity tells defaults from real input
  const initialScenarioRef = useRef(scenario)
  const onPreflightChangeRef = useRef(onPreflightChange)
  onPreflightChangeRef.current = onPreflightChange

  // Recompute the preflight whenever the scenario changes. Cost comes from the ML service
  // (debounced, cached); policy rules stay deterministic. If the service is down the
  // prediction is null and the static benchmark is used.
  useEffect(() => {
    if (!scenario.treatment.trim()) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      const mlPrediction = await fetchMlCostPrediction(scenario, controller.signal)
      if (controller.signal.aborted) return
      const result = evaluatePolicyPreflight(scenario, policyResult, { mlPrediction })
      setPreflight(result)
      onPreflightChangeRef.current?.(scenario, result, scenario !== initialScenarioRef.current)
    }, scenarioNeedsMlCost(scenario) ? 300 : 0)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [scenario, policyResult])

  const handleResolveMissingField = (field: string, value: any) => {
    setScenario(prev => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleSaveQuoteLineItems = (items: QuoteLineItem[], totalQuotedAmount: number) => {
    setScenario(prev => ({
      ...prev,
      quoteLineItems: items,
      quotedCost: totalQuotedAmount,
    }))
    setShowQuoteModal(false)
  }

  const handleOpenEvidenceDetails = (evidence: { page: number | null; quote: string; title: string }) => {
    // Find matching rule from policyResult or synthesize
    const found = policyResult.rules.find(r => r.rule_name.toLowerCase().includes(evidence.title.toLowerCase()))
    if (found) {
      setActiveEvidenceModal(found)
    } else {
      setActiveEvidenceModal({
        id: `ev_${Date.now()}`,
        category: 'coverage',
        rule_name: evidence.title,
        value: 'Evidence Referenced',
        description: evidence.quote,
        status: 'covered',
        conditions: [],
        page_number: evidence.page,
        section_name: 'Policy Clause',
        evidence_text: evidence.quote,
        confidence: 'high',
        evidence_validated: true,
      })
    }
  }

  return (
    <div className="flex flex-col xl:flex-row gap-6">
      {/* ─── Scenario Inputs Sidebar ────────────────────────────────────────── */}
      <div className="w-full xl:w-[380px] shrink-0 space-y-4 order-2 xl:order-1">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
            <h3 className="text-base font-semibold text-white">Your stay</h3>
          </div>

          <form className="space-y-3.5 text-xs" onSubmit={(e) => e.preventDefault()}>
            {/* Treatment Selector with Procedure Suggestions */}
            <div>
              <label className="block text-slate-300 font-medium mb-1 flex items-center justify-between">
                <span>Treatment</span>
              </label>
              <input
                type="text"
                list="canonical-procedures"
                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-emerald-500 font-sans"
                value={scenario.treatment}
                onChange={e => setScenario({ ...scenario, treatment: e.target.value })}
                placeholder="e.g. Total Knee Replacement, Cataract"
              />
              <datalist id="canonical-procedures">
                {CANONICAL_PROCEDURES.map(p => (
                  <option key={p.key} value={p.label} />
                ))}
              </datalist>
            </div>

            {/* Inception & Admission Dates */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-slate-400 text-[11px] mb-1 flex items-center gap-1">
                  Policy started
                </label>
                <input
                  type="date"
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-emerald-500"
                  value={scenario.policyStartDate || ''}
                  onChange={e => setScenario({ ...scenario, policyStartDate: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-slate-400 text-[11px] mb-1 flex items-center gap-1">
                  <Calendar size={11} /> Admission
                </label>
                <input
                  type="date"
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-emerald-500"
                  value={scenario.proposedAdmissionDate || ''}
                  onChange={e => setScenario({ ...scenario, proposedAdmissionDate: e.target.value })}
                />
              </div>
            </div>

            {/* Patient Age & City */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-slate-400 text-[11px] mb-1 flex items-center gap-1">
                  Age
                </label>
                <input
                  type="number"
                  min="0"
                  max="110"
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-emerald-500"
                  value={scenario.age}
                  onChange={e => setScenario({ ...scenario, age: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label className="block text-slate-400 text-[11px] mb-1 flex items-center gap-1">
                  City
                </label>
                <input
                  type="text"
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-emerald-500"
                  value={scenario.city}
                  onChange={e => setScenario({ ...scenario, city: e.target.value })}
                  placeholder="e.g. Mumbai"
                />
              </div>
            </div>

            {/* Room & Hospital Type */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-slate-400 text-[11px] mb-1 flex items-center gap-1">
                  Room
                </label>
                <select
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-emerald-500 capitalize"
                  value={scenario.roomType}
                  onChange={e => setScenario({ ...scenario, roomType: e.target.value as any })}
                >
                  <option value="general">General Ward</option>
                  <option value="twin-sharing">Twin Sharing</option>
                  <option value="single-private">Single Private AC</option>
                  <option value="suite">Deluxe Suite</option>
                  <option value="icu">ICU / CCU</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] mb-1">Hospital</label>
                <select
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-emerald-500"
                  value={scenario.hospitalType}
                  onChange={e => setScenario({ ...scenario, hospitalType: e.target.value as any })}
                >
                  <option value="public">Government / Public</option>
                  <option value="private">Private Nursing Home</option>
                  <option value="corporate">Corporate Hospital</option>
                </select>
              </div>
            </div>

            {/* Stay Duration & Available SI */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-slate-400 text-[11px] mb-1">Days in hospital</label>
                <input
                  type="number"
                  min="1"
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-emerald-500"
                  value={scenario.stayDurationDays}
                  onChange={e => setScenario({ ...scenario, stayDurationDays: parseInt(e.target.value) || 1 })}
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] mb-1">Cover left (₹)</label>
                <input
                  type="number"
                  step="50000"
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-emerald-500"
                  value={scenario.availableSumInsured || ''}
                  onChange={e => setScenario({ ...scenario, availableSumInsured: parseInt(e.target.value) || undefined })}
                  placeholder="500000"
                />
              </div>
            </div>

            {/* Declared PED Selection */}
            <div>
              <label className="block text-slate-400 text-[11px] mb-1">Existing conditions</label>
              <div className="flex flex-wrap gap-1.5">
                {['Diabetes', 'Hypertension', 'Arthritis', 'Cataract'].map(ped => {
                  const isChecked = scenario.declaredPED?.includes(ped)
                  return (
                    <button
                      key={ped}
                      type="button"
                      onClick={() => {
                        const current = scenario.declaredPED || []
                        const updated = isChecked ? current.filter(p => p !== ped) : [...current, ped]
                        setScenario({ ...scenario, declaredPED: updated })
                      }}
                      className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                        isChecked
                          ? 'bg-amber-950/80 border-amber-500 text-amber-300 font-semibold'
                          : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {isChecked ? `✓ ${ped}` : `+ ${ped}`}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Hospital Quote Action Box */}
            <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-300 font-medium block">Hospital quote</span>
                <span className="text-[11px] text-slate-500">
                  {scenario.quoteLineItems?.length
                    ? `${scenario.quoteLineItems.length} line items loaded`
                    : 'Using typical prices'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowQuoteModal(true)}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1 font-medium transition-colors"
              >
                <Upload size={12} />
                {scenario.quoteLineItems?.length ? 'Edit' : 'Add quote'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ─── Result: one number first, details on request ───────────────────── */}
      <div className="flex-1 min-w-0 space-y-5 order-1 xl:order-2">
        {!preflight ? (
          <p className="sx-wait">Working it out...</p>
        ) : (
          <>
            <section className="sx-result" aria-label="Your estimated share">
              <p className="sx-result-lead">You would pay about</p>
              <p className="sx-result-amt">{formatINR(preflight.patientShare.typical)}</p>
              <p className="sx-result-meta">
                of a {formatINR(preflight.treatmentCost.typical)} bill. Your insurer covers{' '}
                <strong>{formatINR(preflight.potentiallyCovered.typical)}</strong>.
              </p>
              <div
                className="sx-result-bar"
                role="img"
                aria-label={`Insurer covers ${
                  preflight.treatmentCost.typical > 0
                    ? Math.round((preflight.potentiallyCovered.typical / preflight.treatmentCost.typical) * 100)
                    : 0
                } percent`}
              >
                <i
                  style={{
                    width: `${
                      preflight.treatmentCost.typical > 0
                        ? Math.min(100, Math.round((preflight.potentiallyCovered.typical / preflight.treatmentCost.typical) * 100))
                        : 0
                    }%`,
                  }}
                />
              </div>
              <div className="sx-result-foot">
                <span className={`sx-status sx-status-${preflight.status}`}>
                  {preflight.status === 'eligible'
                    ? 'Looks covered'
                    : preflight.status === 'conditional'
                    ? 'Covered with conditions'
                    : preflight.status === 'not_eligible'
                    ? 'Not covered'
                    : 'Needs more info'}
                </span>
                <span className="sx-result-range">
                  Bill could be {formatINR(preflight.treatmentCost.min)} to {formatINR(preflight.treatmentCost.max)}
                </span>
              </div>
            </section>

            <div className="sx-chips" role="tablist" aria-label="More about this estimate">
              {(
                [
                  ['ledger', 'Breakdown'],
                  ['what_if', 'What if'],
                  ['timeline', 'Before you go'],
                  ['risk_analyzer', 'Risks'],
                  ['export', 'Save'],
                ] as const
              ).map(([id, label]) => {
                const selected =
                  activePreflightTab === id ||
                  (id === 'timeline' && (activePreflightTab === 'readiness' || activePreflightTab === 'missing_info'))
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    className="sx-chip"
                    onClick={() => setActivePreflightTab(id)}
                  >
                    {label}
                    {id === 'timeline' && preflight.missingInformation.length > 0 && <b>{preflight.missingInformation.length}</b>}
                  </button>
                )
              })}
            </div>

            <div className="space-y-5">
              {activePreflightTab === 'ledger' && (
                <>
                  <CostLedger
                    totalCost={preflight.treatmentCost.typical}
                    coveredAmount={preflight.potentiallyCovered.typical}
                    patientShare={preflight.patientShare.typical}
                    costSource={preflight.costSource}
                    ledger={preflight.ledger}
                    onOpenEvidence={handleOpenEvidenceDetails}
                  />
                  <details className="sx-more">
                    <summary>How the money flows</summary>
                    <ClauseFlowVisualizer
                      totalCost={preflight.treatmentCost.typical}
                      coveredAmount={preflight.potentiallyCovered.typical}
                      patientShare={preflight.patientShare.typical}
                      ledger={preflight.ledger}
                      onSelectRule={() => setActivePreflightTab('ledger')}
                    />
                  </details>
                  {preflight.costModel && (
                    <details className="sx-more">
                      <summary>Where the bill estimate comes from</summary>
                      <ul>
                        <li>
                          Source: {preflight.costSource.replace(/_/g, ' ')}. {preflight.costModel.uncertaintyLevel} uncertainty,{' '}
                          {Math.round(preflight.costModel.confidenceScore * 100)}% confidence.
                        </li>
                        {preflight.costModel.drivers.map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                        {preflight.costModel.warnings.map((w, i) => (
                          <li key={`w${i}`}>{w}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </>
              )}

              {activePreflightTab === 'what_if' && (
                <WhatIfPanel
                  currentScenario={scenario}
                  currentPreflight={preflight}
                  policyResult={policyResult}
                  onApplyScenarioChange={(updated) => setScenario(updated)}
                />
              )}

              {(activePreflightTab === 'timeline' ||
                activePreflightTab === 'readiness' ||
                activePreflightTab === 'missing_info') && (
                <>
                  {preflight.missingInformation.length > 0 && (
                    <MissingInfoPanel
                      missingFields={preflight.missingInformation}
                      onResolveField={handleResolveMissingField}
                    />
                  )}
                  <PolicyTimeline
                    milestones={preflight.milestones || []}
                    policyStartDate={scenario.policyStartDate}
                    proposedAdmissionDate={scenario.proposedAdmissionDate}
                    onOpenEvidence={handleOpenEvidenceDetails}
                  />
                  <ClaimReadiness
                    items={preflight.readinessChecklist || []}
                    isNetworkHospital={scenario.isNetworkHospital}
                  />
                </>
              )}

              {activePreflightTab === 'export' && (
                <ExportSummary scenario={scenario} preflight={preflight} policy={policyResult} />
              )}

              {activePreflightTab === 'risk_analyzer' && (
                <CoverageRiskAnalyzer policyRules={policyResult.rules} policyName={policyResult.overview?.plan_name} />
              )}
            </div>
          </>
        )}
      </div>

      {/* Quote Review Modal */}
      {showQuoteModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <QuoteReview
              onSaveQuote={handleSaveQuoteLineItems}
              onCancel={() => setShowQuoteModal(false)}
            />
          </div>
        </div>
      )}

      {/* Slide-in Evidence Viewer Panel */}
      {activeEvidenceModal && (
        <EvidenceViewer
          rule={activeEvidenceModal}
          onClose={() => setActiveEvidenceModal(null)}
        />
      )}
    </div>
  )
}
