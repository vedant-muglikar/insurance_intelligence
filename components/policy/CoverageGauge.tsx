'use client'

import React, { useEffect, useState } from 'react'
import { formatINR } from '@/lib/policy/normalizers'

interface CoverageGaugeProps {
  totalCost: number
  coveredAmount: number
  patientShare: number
  status: string
  evidenceCoverage: number
}

/** Coverage readout: the admissible share as a ledger figure with a stamp and a split rule. */
export function CoverageGauge({ totalCost, coveredAmount, patientShare, status, evidenceCoverage }: CoverageGaugeProps) {
  const [shown, setShown] = useState(0)
  const coveredRatio = totalCost > 0 ? Math.min(100, Math.max(0, Math.round((coveredAmount / totalCost) * 100))) : 0

  useEffect(() => {
    const t = setTimeout(() => setShown(coveredRatio), 80)
    return () => clearTimeout(t)
  }, [coveredRatio])

  const isDenied = status === 'not_eligible' || coveredRatio === 0
  const isHighRisk = coveredRatio < 50 || isDenied
  const isSafe = coveredRatio >= 80 && !isDenied
  const tone = isSafe ? 'ok' : isHighRisk ? 'deny' : 'warn'

  const verdict = isSafe
    ? `High insurer protection (${coveredRatio}%)`
    : isHighRisk
      ? 'High patient out-of-pocket risk'
      : `Moderate out-of-pocket share (${100 - coveredRatio}%)`

  return (
    <section className="pl-gauge" data-tone={tone} aria-label="Coverage readout">
      <div className="pl-gauge-fig">
        <span className="pl-gauge-cap">{isDenied ? 'Inadmissible' : 'Admissible'}</span>
        <span className="pl-num pl-gauge-pct">
          {shown}
          <small>%</small>
        </span>
      </div>

      <div className="pl-gauge-body">
        <div className="pl-gauge-marks">
          <span className={`pl-stamp pl-stamp-${isSafe ? 'ok' : isHighRisk ? 'deny' : 'info'}`}>{verdict}</span>
          <span className="pl-gauge-evidence">{evidenceCoverage}% verified evidence</span>
        </div>

        <p className="pl-gauge-text">
          {isDenied
            ? 'This treatment is currently inadmissible under an active policy waiting period or exclusion clause.'
            : isSafe
              ? 'Policy limits and deductibles leave minimal out-of-pocket exposure for this procedure.'
              : 'Substantial deductions apply from co-payments, room category limits, or treatment sub-limits.'}
        </p>

        <div className="pl-gauge-split">
          <div className="pl-gauge-line">
            <span>Insurer pays</span>
            <b className="pl-num pl-gauge-ins">{formatINR(coveredAmount)}</b>
          </div>
          <div className="pl-gauge-bar" role="img" aria-label={`Insurer pays ${shown}% of the estimate`}>
            <span style={{ width: `${shown}%` }} />
          </div>
          <div className="pl-gauge-line">
            <span>You pay</span>
            <b className="pl-num pl-gauge-you">{formatINR(patientShare)}</b>
          </div>
        </div>
      </div>
    </section>
  )
}
