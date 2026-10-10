'use client'

import { useState, useCallback, useRef } from 'react'
import { UploadScreen } from './policy/UploadScreen'
import { ProcessingTimeline } from './policy/ProcessingTimeline'
import { PolicyResults } from './policy/PolicyResults'
import type { PolicyAnalysisResult } from '@/lib/types/policy'
import {
  analyzePolicyUpload,
  AnalysisCancelledError,
  applyProgressEvent,
  INITIAL_PROGRESS,
  type AnalysisProgressState,
} from '@/lib/client/analyzePolicyUpload'
import { AlertTriangle } from 'lucide-react'

type AppState = 'upload' | 'processing' | 'results' | 'error'

export default function PolicyLens() {
  const [state, setState] = useState<AppState>('upload')
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState<PolicyAnalysisResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [progress, setProgress] = useState<AnalysisProgressState | null>(null)
  const abortRef = useRef<(() => void) | null>(null)

  const handleAnalyze = useCallback(async (file: File) => {
    setFileName(file.name)
    setState('processing')
    setErrorMsg(null)
    setProgress(INITIAL_PROGRESS)

    const { promise, abort } = analyzePolicyUpload(file, (event) => {
      setProgress((prev) => {
        const current = prev ?? INITIAL_PROGRESS
        if (event.type === 'upload') {
          return { ...current, uploadPct: event.pct, message: event.pct < 100 ? `Uploading… ${event.pct}%` : 'Upload complete — waiting for server…' }
        }
        return applyProgressEvent(current, event)
      })
    })
    abortRef.current = abort

    try {
      const data = await promise
      setResult(data)
      setState('results')
    } catch (err: any) {
      if (err instanceof AnalysisCancelledError) {
        setState('upload')
        setFileName('')
      } else {
        setErrorMsg(err?.message || 'Unexpected error during analysis.')
        setState('error')
      }
    } finally {
      abortRef.current = null
      setProgress(null)
    }
  }, [])

  const handleCancel = useCallback(() => {
    abortRef.current?.()
  }, [])

  const handleLoadSample = useCallback((sample: PolicyAnalysisResult, name: string) => {
    setFileName(name)
    setState('processing')
    setErrorMsg(null)
    setProgress(null)
    setTimeout(() => {
      setResult(sample)
      setState('results')
    }, 1600)
  }, [])

  const reset = () => {
    setState('upload')
    setResult(null)
    setErrorMsg(null)
    setFileName('')
  }

  if (state === 'upload') {
    return <UploadScreen onAnalyze={handleAnalyze} onLoadSample={handleLoadSample} />
  }

  if (state === 'processing') {
    return (
      <ProcessingTimeline
        fileName={fileName}
        progress={progress ?? undefined}
        onCancel={progress ? handleCancel : undefined}
      />
    )
  }

  if (state === 'error') {
    return (
      <div className="upload-screen-wrapper">
        <div className="upload-screen-inner">
          <div className="error-card">
            <AlertTriangle size={28} className="text-red-400" />
            <h2 className="error-title">Analysis failed</h2>
            <p className="error-msg">{errorMsg}</p>
            <div className="error-hints">
              <p>Possible fixes:</p>
              <ul>
                <li>
                  Make sure <code>OPENAI_API_KEY</code> or{' '}
                  <code>GOOGLE_GENERATIVE_AI_API_KEY</code> is set in{' '}
                  <code>.env.local</code>
                </li>
                <li>Check that the PDF is not password-protected</li>
                <li>Try a smaller PDF (under 100 MB)</li>
                <li>For scanned documents, rescan at 300 DPI or higher, flat and well-lit</li>
              </ul>
            </div>
            <button className="button-primary mt-6" onClick={reset}>
              Try again
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (state === 'results' && result) {
    return (
      <PolicyResults result={result} fileName={fileName} onReset={reset} />
    )
  }

  return null
}
