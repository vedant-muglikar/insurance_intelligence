'use client'

import React, { useState } from 'react'
import { TreatmentScenario, CoverageResult, WhatIfDelta } from '@/lib/types/estimate'
import { PolicyAnalysisResult } from '@/lib/types/policy'
import { evaluatePolicyPreflight } from '@/lib/estimate/policy'
import { fetchMlCostPrediction } from '@/lib/estimate/mlClient'
import { formatINR } from '@/lib/policy/normalizers'
import { Sparkles, ArrowRight, CheckCircle2, TrendingDown, TrendingUp, AlertTriangle } from 'lucide-react'

interface WhatIfPanelProps {
  currentScenario: TreatmentScenario
  currentPreflight: CoverageResult
  policyResult: PolicyAnalysisResult
  onApplyScenarioChange: (newScenario: TreatmentScenario) => void
}

export function WhatIfPanel({
  currentScenario,
  currentPreflight,
  policyResult,
  onApplyScenarioChange,
}: WhatIfPanelProps) {
  const [testScenario, setTestScenario] = useState<TreatmentScenario>({ ...currentScenario })
  const [simulatedPreflight, setSimulatedPreflight] = useState<CoverageResult | null>(null)
  const [activeSimulationLabel, setActiveSimulationLabel] = useState<string | null>(null)

  const runSimulation = async (updatedScenario: TreatmentScenario, label: string) => {
    setTestScenario(updatedScenario)
    setActiveSimulationLabel(label)
    // Use the same cost source as the baseline so the delta isolates the policy effect.
    const mlPrediction = await fetchMlCostPrediction(updatedScenario)
    const newPreflight = evaluatePolicyPreflight(updatedScenario, policyResult, { mlPrediction })
    setSimulatedPreflight(newPreflight)
  }

  // Quick Preset Simulator Actions
  const handleRoomToggle = () => {
    const isSuite = testScenario.roomType === 'suite'
    const newRoom = isSuite ? 'single-private' : 'suite'
    runSimulation(
      { ...testScenario, roomType: newRoom },
      isSuite ? 'Downgrade to Eligible Single Private Room' : 'Upgrade to Luxury Suite Room'
    )
  }

  const handleAgeThresholdToggle = () => {
    const isSenior = testScenario.age >= 60
    const newAge = isSenior ? 45 : 65
    runSimulation(
      { ...testScenario, age: newAge },
      isSenior ? 'Change Patient Age to Under 60 (Non-senior)' : 'Change Patient Age to 65+ (Senior Citizen Co-pay)'
    )
  }

  const handleWaitingPeriodDateShift = () => {
    // Shift proposed admission date 1 year later to clear waiting periods
    const today = new Date()
    today.setFullYear(today.getFullYear() + 2)
    const futureDate = today.toISOString().split('T')[0]
    runSimulation(
      { ...testScenario, proposedAdmissionDate: futureDate },
      'Postpone Planned Admission to Post-Waiting Period Date'
    )
  }

  const handleApplySimulation = () => {
    if (simulatedPreflight) {
      onApplyScenarioChange(testScenario)
      setSimulatedPreflight(null)
      setActiveSimulationLabel(null)
    }
  }

  const computeDelta = (): WhatIfDelta | null => {
    if (!simulatedPreflight) return null

    const coveredDelta = simulatedPreflight.potentiallyCovered.typical - currentPreflight.potentiallyCovered.typical
    const patientShareDelta = simulatedPreflight.patientShare.typical - currentPreflight.patientShare.typical

    let explanation = ''
    if (testScenario.roomType !== currentScenario.roomType) {
      explanation = `Room category changed from ${currentScenario.roomType} to ${testScenario.roomType}.`
    } else if (testScenario.age !== currentScenario.age) {
      explanation = `Patient age changed from ${currentScenario.age} to ${testScenario.age}.`
    } else if (testScenario.proposedAdmissionDate !== currentScenario.proposedAdmissionDate) {
      explanation = `Proposed admission date moved to ${testScenario.proposedAdmissionDate}.`
    } else {
      explanation = 'Scenario parameters recomputed.'
    }

    return {
      field: 'scenario',
      label: activeSimulationLabel || 'Scenario Modification',
      oldValue: currentPreflight.patientShare.typical,
      newValue: simulatedPreflight.patientShare.typical,
      coveredDelta,
      patientShareDelta,
      explanation,
    }
  }

  const delta = computeDelta()

  return (
    <div className="bg-[var(--card)] border border-cyan-500/30 rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
        <div>
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            What-If Scenario Simulator
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Test how changing room categories, admission dates, or patient age impacts your covered amount in real time.
          </p>
        </div>
      </div>

      {/* Preset simulation buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleRoomToggle}
          className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5"
        >
          🏨 {testScenario.roomType === 'suite' ? 'Switch to Single Private Room' : 'Test Suite Room Proration'}
        </button>

        <button
          type="button"
          onClick={handleAgeThresholdToggle}
          className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5"
        >
          🎂 {testScenario.age >= 60 ? 'Test Under 60 (No Senior Co-pay)' : 'Test Age 65+ (Senior Co-pay Trigger)'}
        </button>

        <button
          type="button"
          onClick={handleWaitingPeriodDateShift}
          className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5"
        >
          📅 Shift Date Past 24-Mo Wait Period
        </button>
      </div>

      {/* Side-by-side comparison */}
      {simulatedPreflight && delta && (
        <div className="p-4 rounded-xl bg-slate-950/60 border border-cyan-500/40 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-cyan-300">
              Simulation: {activeSimulationLabel}
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-200 border border-cyan-700">
              Live Preview
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Before card */}
            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
              <span className="text-[11px] uppercase font-semibold text-slate-500 block">
                Current Scenario
              </span>
              <div className="mt-1 flex justify-between items-baseline">
                <span className="text-xs text-slate-400">Patient Share:</span>
                <span className="text-sm font-bold text-white">
                  {formatINR(currentPreflight.patientShare.typical)}
                </span>
              </div>
              <div className="flex justify-between items-baseline text-[11px] text-slate-400 mt-1">
                <span>Potentially Covered:</span>
                <span className="text-emerald-400 font-medium">
                  {formatINR(currentPreflight.potentiallyCovered.typical)}
                </span>
              </div>
              <div className="flex justify-between items-baseline text-[11px] text-slate-400 mt-1">
                <span>Status:</span>
                <span className="capitalize text-slate-300 font-mono">
                  {currentPreflight.status.replace(/_/g, ' ')}
                </span>
              </div>
            </div>

            {/* After card */}
            <div className="p-3 rounded-lg bg-cyan-950/20 border border-cyan-500/40">
              <span className="text-[11px] uppercase font-semibold text-cyan-400 block">
                Simulated Outcome
              </span>
              <div className="mt-1 flex justify-between items-baseline">
                <span className="text-xs text-cyan-200">Patient Share:</span>
                <span className="text-sm font-bold text-cyan-300">
                  {formatINR(simulatedPreflight.patientShare.typical)}
                </span>
              </div>
              <div className="flex justify-between items-baseline text-[11px] text-slate-400 mt-1">
                <span>Potentially Covered:</span>
                <span className="text-emerald-400 font-medium">
                  {formatINR(simulatedPreflight.potentiallyCovered.typical)}
                </span>
              </div>
              <div className="flex justify-between items-baseline text-[11px] text-slate-400 mt-1">
                <span>Status:</span>
                <span className="capitalize text-cyan-200 font-mono">
                  {simulatedPreflight.status.replace(/_/g, ' ')}
                </span>
              </div>
            </div>
          </div>

          {/* Delta Banner (Hero interaction from blueprint) */}
          <div className="p-3 rounded-lg bg-slate-900 border border-slate-700/80 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              {delta.patientShareDelta < 0 ? (
                <TrendingDown className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : delta.patientShareDelta > 0 ? (
                <TrendingUp className="w-5 h-5 text-amber-400 shrink-0" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-cyan-400 shrink-0" />
              )}
              <div>
                <p className="font-semibold text-white">
                  Patient share changed by{' '}
                  <span className={delta.patientShareDelta < 0 ? 'text-emerald-400 font-bold' : delta.patientShareDelta > 0 ? 'text-amber-400 font-bold' : 'text-slate-300 font-bold'}>
                    {delta.patientShareDelta > 0 ? `+${formatINR(delta.patientShareDelta)}` : formatINR(delta.patientShareDelta)}
                  </span>
                </p>
                <p className="text-[11px] text-slate-400">{delta.explanation}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleApplySimulation}
              className="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors shrink-0"
            >
              Commit Scenario
              <ArrowRight size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
