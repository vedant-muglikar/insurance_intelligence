'use client'

import React, { useState, useEffect } from 'react'
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
import { CoverageGauge } from './CoverageGauge'
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
}

export function EstimateForm({ policyResult }: EstimateFormProps) {
  // Default scenario initialized with smart defaults
  const [scenario, setScenario] = useState<TreatmentScenario>({
    treatment: 'Total Knee Replacement',
    age: 58,
    city: 'Mumbai',
    hospitalType: 'private',
    roomType: 'single-private',
    stayDurationDays: 4,
    policyStartDate: '2023-01-15',
    proposedAdmissionDate: new Date().toISOString().split('T')[0],
    declaredPED: [],
    availableSumInsured: policyResult.overview.sum_insured
      ? parseInt(policyResult.overview.sum_insured.replace(/[^0-9]/g, '')) || 500000
      : 500000,
    isNetworkHospital: true,
  })

  const [activePreflightTab, setActivePreflightTab] = useState<
    'ledger' | 'missing_info' | 'what_if' | 'timeline' | 'readiness' | 'quote' | 'export' | 'risk_analyzer'
  >('ledger')

  const [preflight, setPreflight] = useState<CoverageResult | null>(null)
  const [activeEvidenceModal, setActiveEvidenceModal] = useState<PolicyRule | null>(null)
  const [showQuoteModal, setShowQuoteModal] = useState(false)

  // Recompute the preflight whenever the scenario changes. Cost comes from the ML service
  // (debounced, cached); policy rules stay deterministic. If the service is down the
  // prediction is null and the static benchmark is used.
  useEffect(() => {
    if (!scenario.treatment.trim()) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      const mlPrediction = await fetchMlCostPrediction(scenario, controller.signal)
      if (controller.signal.aborted) return
      setPreflight(evaluatePolicyPreflight(scenario, policyResult, { mlPrediction }))
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
    <div className="flex flex-col xl:flex-row gap-6 p-4">
      {/* ─── Scenario Inputs Sidebar ────────────────────────────────────────── */}
      <div className="w-full xl:w-[380px] shrink-0 space-y-4">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Calculator className="w-4 h-4 text-emerald-400" />
              Pre-Admission Preflight
            </h3>
            <span className="text-[11px] uppercase px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
              Deterministic
            </span>
          </div>

          <form className="space-y-3.5 text-xs" onSubmit={(e) => e.preventDefault()}>
            {/* Treatment Selector with Procedure Suggestions */}
            <div>
              <label className="block text-slate-300 font-medium mb-1 flex items-center justify-between">
                <span>Treatment / Procedure</span>
                <span className="text-[11px] text-slate-500 font-normal">Canonical match</span>
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
                  <Calendar size={11} /> Policy Start Date
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
                  <Calendar size={11} /> Planned Admission
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
                  <User size={11} /> Patient Age
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
                  <Building2 size={11} /> City
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
                  <Bed size={11} /> Room Choice
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
                <label className="block text-slate-400 text-[11px] mb-1">Hospital Tier</label>
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
                <label className="block text-slate-400 text-[11px] mb-1">Stay Duration (Days)</label>
                <input
                  type="number"
                  min="1"
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-emerald-500"
                  value={scenario.stayDurationDays}
                  onChange={e => setScenario({ ...scenario, stayDurationDays: parseInt(e.target.value) || 1 })}
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] mb-1">Available Sum Insured (₹)</label>
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
              <label className="block text-slate-400 text-[11px] mb-1">Declared Pre-existing Diseases</label>
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
                <span className="text-[11px] text-slate-300 font-medium block">Hospital Estimate Document</span>
                <span className="text-[11px] text-slate-500">
                  {scenario.quoteLineItems?.length
                    ? `${scenario.quoteLineItems.length} line items loaded`
                    : 'Using benchmark tariff'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowQuoteModal(true)}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1 font-medium transition-colors"
              >
                <Upload size={12} />
                {scenario.quoteLineItems?.length ? 'Edit Quote' : 'Upload Quote'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ─── Preflight Results & Module Workspace ───────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-4">
        {!preflight ? (
          <div className="h-64 flex flex-col items-center justify-center text-slate-500 border border-[var(--border)] rounded-xl border-dashed bg-[var(--card2)] p-10">
            <Calculator className="w-10 h-10 mb-3 opacity-40 text-emerald-400" />
            <p className="text-sm">Calculating deterministic coverage preflight...</p>
          </div>
        ) : (
          <>
            {/* Statement of patient share: a ruled ledger block */}
            <section className="pl-statement" aria-label="Statement of patient share">
              <header className="pl-st-head">
                <h3>Statement of patient share</h3>
                <span className="pl-stamp pl-stamp-info">{preflight.costSource.replace(/_/g, ' ')}</span>
              </header>

              <div className="pl-st-row">
                <div className="pl-st-what">
                  <strong>Total treatment expense</strong>
                  <em>Range {formatINR(preflight.treatmentCost.min)} to {formatINR(preflight.treatmentCost.max)}</em>
                </div>
                <span className="pl-num pl-st-amt">{formatINR(preflight.treatmentCost.typical)}</span>
              </div>

              <div className="pl-st-row" data-tone="ok">
                <div className="pl-st-what">
                  <strong>Potentially covered by insurer</strong>
                  <em>
                    Verified evidence {preflight.evidenceCoverage}%
                    {preflight.treatmentCost.typical > 0
                      ? ` · ${Math.round((preflight.potentiallyCovered.typical / preflight.treatmentCost.typical) * 100)}% admissible`
                      : ''}
                  </em>
                </div>
                <span className="pl-num pl-st-amt">{formatINR(preflight.potentiallyCovered.typical)}</span>
              </div>

              <div className="pl-st-row pl-st-total" data-tone="deny">
                <div className="pl-st-what">
                  <strong>Estimated patient share</strong>
                  <em>
                    Out of pocket
                    {preflight.treatmentCost.typical > 0
                      ? ` · ${Math.round((preflight.patientShare.typical / preflight.treatmentCost.typical) * 100)}% of bill`
                      : ''}
                  </em>
                </div>
                <span className="pl-num pl-st-amt">{formatINR(preflight.patientShare.typical)}</span>
              </div>

              {preflight.costModel && (
                <div className="pl-st-notes">
                  <div>
                    Model estimate · {preflight.costModel.uncertaintyLevel} uncertainty ·{' '}
                    {Math.round(preflight.costModel.confidenceScore * 100)}% confidence
                  </div>
                  {preflight.costModel.drivers.map((d, i) => (
                    <div key={i}>• {d}</div>
                  ))}
                  {preflight.costModel.warnings.map((w, i) => (
                    <div key={`w${i}`} className="pl-st-warn">
                      ⚠ {w}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Coverage readout */}
            <CoverageGauge
              totalCost={preflight.treatmentCost.typical}
              coveredAmount={preflight.potentiallyCovered.typical}
              patientShare={preflight.patientShare.typical}
              status={preflight.status}
              evidenceCoverage={preflight.evidenceCoverage}
            />

            {/* Interactive Clause-to-Rupee Pipeline Flow Visualizer */}
            <ClauseFlowVisualizer
              totalCost={preflight.treatmentCost.typical}
              coveredAmount={preflight.potentiallyCovered.typical}
              patientShare={preflight.patientShare.typical}
              ledger={preflight.ledger}
              onSelectRule={(line) => {
                setActivePreflightTab('ledger')
              }}
            />

            {/* Status & Preflight Diagnostic Bar */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">Preflight Status:</span>
                  <span
                    className={`font-semibold uppercase px-2 py-0.5 rounded text-[11px] font-mono ${
                      preflight.status === 'eligible'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                        : preflight.status === 'conditional'
                        ? 'bg-blue-950 text-blue-300 border border-blue-700'
                        : preflight.status === 'not_eligible'
                        ? 'bg-red-950 text-red-300 border border-red-700'
                        : 'bg-amber-950 text-amber-300 border border-amber-700'
                    }`}
                  >
                    {preflight.status.replace(/_/g, ' ')}
                  </span>
                </div>

                <div className="hidden md:flex items-center gap-1.5 text-slate-400">
                  <span>·</span>
                  <span>Cost Conf: <strong className="capitalize text-slate-200">{preflight.costConfidence}</strong></span>
                  <span>·</span>
                  <span>Policy Conf: <strong className="capitalize text-slate-200">{preflight.coverageConfidence}</strong></span>
                </div>
              </div>

              <div className="text-[11px] text-slate-400">
                {preflight.ledger.length} Clause Adjustment{preflight.ledger.length !== 1 ? 's' : ''}
              </div>
            </div>

            {/* Preflight Workspace Navigation Tabs */}
            <div className="flex items-center gap-1 border-b border-[var(--border)] overflow-x-auto pb-1 text-xs">
              <button
                type="button"
                onClick={() => setActivePreflightTab('ledger')}
                className={`px-3 py-2 rounded-t-lg font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  activePreflightTab === 'ledger'
                    ? 'bg-[var(--card)] text-emerald-400 border-t-2 border-emerald-400'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileText size={13} />
                Clause-to-Rupee Ledger
              </button>

              <button
                type="button"
                onClick={() => setActivePreflightTab('missing_info')}
                className={`px-3 py-2 rounded-t-lg font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  activePreflightTab === 'missing_info'
                    ? 'bg-[var(--card)] text-amber-400 border-t-2 border-amber-400'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <HelpCircle size={13} />
                Missing Info Engine
                {preflight.missingInformation.length > 0 && (
                  <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-400 text-[11px] flex items-center justify-center font-bold">
                    {preflight.missingInformation.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActivePreflightTab('risk_analyzer')}
                className={`px-3 py-2 rounded-t-lg font-medium transition-colors flex items-center gap-1.5 ${
                  activePreflightTab === 'risk_analyzer'
                    ? 'bg-[var(--card)] text-rose-400 border-t-2 border-rose-400'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <ShieldAlert size={13} />
                Risk Analyzer
              </button>

              <button
                type="button"
                onClick={() => setActivePreflightTab('what_if')}
                className={`px-3 py-2 rounded-t-lg font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  activePreflightTab === 'what_if'
                    ? 'bg-[var(--card)] text-cyan-400 border-t-2 border-cyan-400'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sparkles size={13} />
                What-If Simulator
              </button>

              <button
                type="button"
                onClick={() => setActivePreflightTab('timeline')}
                className={`px-3 py-2 rounded-t-lg font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  activePreflightTab === 'timeline'
                    ? 'bg-[var(--card)] text-blue-400 border-t-2 border-blue-400'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Clock size={13} />
                Waiting Milestones
              </button>

              <button
                type="button"
                onClick={() => setActivePreflightTab('readiness')}
                className={`px-3 py-2 rounded-t-lg font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  activePreflightTab === 'readiness'
                    ? 'bg-[var(--card)] text-purple-400 border-t-2 border-purple-400'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <CheckSquare size={13} />
                Pre-Auth Checklist
              </button>

              <button
                type="button"
                onClick={() => setActivePreflightTab('export')}
                className={`px-3 py-2 rounded-t-lg font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  activePreflightTab === 'export'
                    ? 'bg-[var(--card)] text-slate-200 border-t-2 border-slate-300'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Download size={13} />
                Preflight Export
              </button>
            </div>

            {/* Active Tab Sub-view Content */}
            <div className="space-y-4">
              {activePreflightTab === 'ledger' && (
                <CostLedger
                  totalCost={preflight.treatmentCost.typical}
                  coveredAmount={preflight.potentiallyCovered.typical}
                  patientShare={preflight.patientShare.typical}
                  costSource={preflight.costSource}
                  ledger={preflight.ledger}
                  onOpenEvidence={handleOpenEvidenceDetails}
                />
              )}

              {activePreflightTab === 'missing_info' && (
                <MissingInfoPanel
                  missingFields={preflight.missingInformation}
                  onResolveField={handleResolveMissingField}
                />
              )}

              {activePreflightTab === 'what_if' && (
                <WhatIfPanel
                  currentScenario={scenario}
                  currentPreflight={preflight}
                  policyResult={policyResult}
                  onApplyScenarioChange={(updated) => setScenario(updated)}
                />
              )}

              {activePreflightTab === 'timeline' && (
                <PolicyTimeline
                  milestones={preflight.milestones || []}
                  policyStartDate={scenario.policyStartDate}
                  proposedAdmissionDate={scenario.proposedAdmissionDate}
                  onOpenEvidence={handleOpenEvidenceDetails}
                />
              )}

              {activePreflightTab === 'readiness' && (
                <ClaimReadiness
                  items={preflight.readinessChecklist || []}
                  isNetworkHospital={scenario.isNetworkHospital}
                />
              )}

              {activePreflightTab === 'export' && (
                <ExportSummary
                  scenario={scenario}
                  preflight={preflight}
                  policy={policyResult}
                />
              )}

              {activePreflightTab === 'risk_analyzer' && (
                <CoverageRiskAnalyzer
                  policyRules={policyResult.rules}
                  policyName={policyResult.overview?.plan_name}
                />
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
