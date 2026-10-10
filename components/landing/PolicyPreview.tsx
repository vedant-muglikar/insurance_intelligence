'use client'

import { useMemo, useState } from 'react'
import { SAMPLE_POLICIES } from '@/lib/policy/samplePolicies'
import { evaluatePolicyPreflight } from '@/lib/estimate/policy'
import { formatINR } from '@/lib/policy/normalizers'
import type { TreatmentScenario } from '@/lib/types/estimate'
import './policy-preview.css'

/**
 * Real output, not a mock: each tab runs the same estimate engine the tool uses
 * against a bundled sample policy. Nothing here is typed in by hand except the scenario inputs.
 */
type Case = {
  id: string
  tab: string
  policyKey: keyof typeof SAMPLE_POLICIES
  scenario: TreatmentScenario
  summary: string
}

const BASE = {
  hospitalType: 'private' as const,
  policyStartDate: '2023-01-15',
  proposedAdmissionDate: '2026-11-02',
  declaredPED: [] as string[],
  isNetworkHospital: true,
}

const CASES: Case[] = [
  {
    id: 'cataract',
    tab: 'Cataract surgery',
    policyKey: 'hdfc_optima',
    summary: 'Age 62, Pune, private hospital, day care',
    scenario: { ...BASE, treatment: 'Cataract Surgery', age: 62, city: 'Pune', roomType: 'general', stayDurationDays: 1 },
  },
  {
    id: 'knee',
    tab: 'Knee replacement',
    policyKey: 'hdfc_optima',
    summary: 'Age 65, Mumbai, private hospital, suite room, 4 days',
    scenario: { ...BASE, treatment: 'Total Knee Replacement', age: 65, city: 'Mumbai', roomType: 'suite', stayDurationDays: 4 },
  },
  {
    id: 'maternity',
    tab: 'C-section',
    policyKey: 'star_health',
    summary: 'Age 30, Delhi, corporate hospital, 4 days, policy 10 months old',
    scenario: {
      ...BASE,
      treatment: 'Maternity (Cesarean Section / C-Section)',
      age: 30,
      city: 'Delhi',
      hospitalType: 'corporate',
      roomType: 'single-private',
      stayDurationDays: 4,
      policyStartDate: '2026-01-10',
    },
  },
]

const IMPACT_LABEL: Record<string, string> = { deduction: 'Deduction', cap: 'Cap applied', denial: 'Not payable', info: 'Note', eligible: 'Eligible' }

export default function PolicyPreview({ compact = false }: { compact?: boolean }) {
  const [id, setId] = useState(CASES[0].id)
  const active = CASES.find((c) => c.id === id)!
  const policy = SAMPLE_POLICIES[active.policyKey]
  const result = useMemo(() => evaluatePolicyPreflight(active.scenario, policy), [active, policy])
  const bill = result.treatmentCost.typical
  const insurer = result.potentiallyCovered.typical
  const you = result.patientShare.typical

  return (
    <figure className={`pp${compact ? ' pp-compact' : ''}`}>
      <div className="pp-tabs" role="tablist" aria-label="Sample cases">
        {CASES.map((c) => (
          <button
            key={c.id}
            role="tab"
            type="button"
            aria-selected={c.id === id}
            className="pp-tab"
            onClick={() => setId(c.id)}
          >
            {c.tab}
          </button>
        ))}
      </div>

      <div className="pp-body" key={active.id}>
        <div className="pp-head">
          <p className="pp-plan">{policy.overview.plan_name}</p>
          <p className="pp-meta">{active.summary}</p>
        </div>

        <dl className="pp-rows">
          <div className="pp-row">
            <dt>
              <strong>Hospital estimate</strong>
              <span>Benchmark cost before any policy clause</span>
            </dt>
            <dd className="pl-num">{formatINR(bill)}</dd>
          </div>

          {result.ledger.length === 0 && (
            <div className="pp-row pp-row-in" style={{ ['--i' as string]: 1 }}>
              <dt>
                <strong>No deductions</strong>
                <span>Every checked clause allows the full estimate</span>
              </dt>
              <dd className="pl-num pp-ok">{formatINR(0)}</dd>
            </div>
          )}

          {result.ledger.map((l, i) => (
            <div key={l.id} className="pp-row pp-row-in" style={{ ['--i' as string]: i + 1 }}>
              <dt>
                <strong>{l.ruleName}</strong>
                <span>{l.calculation}</span>
              </dt>
              <dd className="pl-num pp-cut">
                <small>{IMPACT_LABEL[l.impact] ?? 'Deduction'}</small>-{formatINR(l.deductionAmount)}
              </dd>
            </div>
          ))}
        </dl>

        <div className="pp-total">
          <div>
            <span>Insurer pays</span>
            <b className="pl-num pp-ok">{formatINR(insurer)}</b>
          </div>
          <div>
            <span>You pay</span>
            <b className="pl-num pp-you">{formatINR(you)}</b>
          </div>
        </div>
      </div>

      <figcaption className="pp-note">Bundled sample policy run through the PolicyLens estimate engine. Not a real policy.</figcaption>
    </figure>
  )
}
