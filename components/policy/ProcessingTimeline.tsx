'use client'

import { useEffect, useState } from 'react'
import { CheckCircle } from '@phosphor-icons/react'
import { BrandMark } from '../ui/Brand'
import type { AnalysisProgressState } from '@/lib/client/analyzePolicyUpload'

interface ProcessingTimelineProps {
  fileName: string
  /** Live server progress. When absent (sample presets) a simulated timeline is shown. */
  progress?: AnalysisProgressState
  onCancel?: () => void
}

const STEPS = ['Opening your PDF', 'Finding the clauses', 'Turning them into rules', 'Checking every quote', 'Getting your estimate ready']

export function ProcessingTimeline({ fileName, progress, onCancel }: ProcessingTimelineProps) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1800)
    return () => clearInterval(t)
  }, [])

  const simulatedPct = Math.round(((step + 1) / STEPS.length) * 100)
  const pct = progress
    ? progress.phase === 'uploading'
      ? Math.round(progress.uploadPct * 0.1)
      : Math.min(100, Math.round(10 + progress.progress * 0.9))
    : simulatedPct

  return (
    <div className="sx-process" role="status" aria-live="polite">
      <div className="sx-process-mark">
        <BrandMark size={84} />
      </div>
      <h1 className="sx-process-title">Reading your policy</h1>
      <p className="sx-process-file">{progress?.message || fileName}</p>

      <div className="sx-bar" aria-hidden>
        <i style={{ width: `${pct}%` }} />
      </div>

      <ol className="sx-steps">
        {STEPS.map((label, i) => (
          <li key={label} data-state={i < step ? 'done' : i === step ? 'now' : 'next'}>
            {i < step ? <CheckCircle size={20} weight="fill" aria-hidden /> : <span aria-hidden />}
            {label}
          </li>
        ))}
      </ol>

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="mt-4 text-xs font-medium text-stone-400 hover:text-stone-200 transition-colors"
        >
          Cancel
        </button>
      )}
    </div>
  )
}
