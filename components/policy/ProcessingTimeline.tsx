'use client'

import { useEffect, useState } from 'react'
import { CheckCircle } from '@phosphor-icons/react'
import { BrandMark } from '../ui/Brand'

interface ProcessingTimelineProps {
  fileName: string
}

const STEPS = ['Opening your PDF', 'Finding the clauses', 'Turning them into rules', 'Checking every quote', 'Getting your estimate ready']

export function ProcessingTimeline({ fileName }: ProcessingTimelineProps) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1800)
    return () => clearInterval(t)
  }, [])

  const pct = Math.round(((step + 1) / STEPS.length) * 100)

  return (
    <div className="sx-process" role="status" aria-live="polite">
      <div className="sx-process-mark">
        <BrandMark size={84} />
      </div>
      <h1 className="sx-process-title">Reading your policy</h1>
      <p className="sx-process-file">{fileName}</p>

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
    </div>
  )
}
