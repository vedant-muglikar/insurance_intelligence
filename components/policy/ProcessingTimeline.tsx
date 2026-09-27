'use client'

import { useEffect, useState } from 'react'
import { Check, Sparkles } from 'lucide-react'

interface ProcessingTimelineProps {
  fileName: string
}

const STEPS = [
  { label: 'Uploading document', detail: 'Sending file to server' },
  { label: 'Extracting text', detail: 'Reading page by page with pdfjs' },
  { label: 'Identifying sections', detail: 'Locating policy clauses' },
  { label: 'AI policy analysis', detail: 'Extracting rules with AI' },
  { label: 'Validating evidence', detail: 'Matching citations to pages' },
  { label: 'Finalizing results', detail: 'Building structured output' },
]

export function ProcessingTimeline({ fileName }: ProcessingTimelineProps) {
  const [currentStep, setCurrentStep] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep((s) => {
        // Advance only up to STEPS.length - 1; the last step stays until done
        if (s < STEPS.length - 1) return s + 1
        return s
      })
    }, 4500)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="processing-wrapper">
      <div className="processing-card">
        {/* Header */}
        <div className="processing-header">
          <div className="icon-box tone-green pulse-ring">
            <Sparkles size={18} />
          </div>
          <div>
            <h2 className="processing-title">Analyzing your policy</h2>
            <p className="processing-subtitle">{fileName}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="processing-progress-track">
          <div
            className="processing-progress-fill"
            style={{
              width: `${Math.round(((currentStep + 1) / STEPS.length) * 100)}%`,
            }}
          />
        </div>
        <div className="processing-pct">
          {Math.round(((currentStep + 1) / STEPS.length) * 100)}% complete
        </div>

        {/* Steps */}
        <div className="processing-steps">
          {STEPS.map((step, idx) => {
            const done = idx < currentStep
            const active = idx === currentStep
            return (
              <div key={step.label} className="processing-step">
                <span
                  className={`processing-step-icon ${done ? 'done' : active ? 'active' : 'pending'}`}
                >
                  {done ? (
                    <Check size={11} />
                  ) : active ? (
                    <span className="step-pulse" />
                  ) : (
                    <span className="step-dot" />
                  )}
                </span>
                <div>
                  <span
                    className={`processing-step-label ${done ? 'done' : active ? 'active' : 'pending'}`}
                  >
                    {step.label}
                  </span>
                  {active && (
                    <div className="processing-step-detail">{step.detail}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <p className="processing-note">
          Processing time depends on document length. Please don't close this tab.
        </p>
      </div>
    </div>
  )
}
