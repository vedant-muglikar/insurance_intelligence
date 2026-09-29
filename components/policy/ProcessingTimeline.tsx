'use client'

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import Loader from '../ui/loader-4'
import OnboardCard from '../ui/onboard-card'

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

// Map step index to OnboardCard labels
const ONBOARD_STEPS: { step1: string; step2: string; step3: string }[] = [
  { step1: 'Ready', step2: 'Uploading document...', step3: 'Extracting text' },
  { step1: 'Uploaded', step2: 'Extracting text...', step3: 'Identifying sections' },
  { step1: 'Text extracted', step2: 'Identifying sections...', step3: 'AI analysis' },
  { step1: 'Sections found', step2: 'AI policy analysis...', step3: 'Validating evidence' },
  { step1: 'Rules extracted', step2: 'Validating evidence...', step3: 'Finalizing' },
  { step1: 'Evidence matched', step2: 'Finalizing results...', step3: 'Almost done' },
]

export function ProcessingTimeline({ fileName }: ProcessingTimelineProps) {
  const [currentStep, setCurrentStep] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep((s) => {
        if (s < STEPS.length - 1) return s + 1
        return s
      })
    }, 4500)
    return () => clearInterval(interval)
  }, [])

  const onboard = ONBOARD_STEPS[currentStep]

  return (
    <div className="processing-wrapper">
      <div className="processing-card" style={{ maxWidth: '580px' }}>
        {/* Header */}
        <div className="processing-header">
          <div className="mr-3">
            <Loader />
          </div>
          <div>
            <h2 className="processing-title">Analyzing your policy</h2>
            <p className="processing-subtitle">{fileName}</p>
          </div>
        </div>

        {/* OnboardCard animation */}
        <div style={{ display: 'flex', justifyContent: 'center', margin: '20px 0' }}>
          <OnboardCard
            key={currentStep}
            duration={4000}
            step1={onboard.step1}
            step2={onboard.step2}
            step3={onboard.step3}
          />
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

        <p className="processing-note">
          Processing time depends on document length. Please don't close this tab.
        </p>
      </div>
    </div>
  )
}

