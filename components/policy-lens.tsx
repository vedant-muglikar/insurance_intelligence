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
import { WarningCircle } from '@phosphor-icons/react'

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
      <div className="sx-process" role="alert">
        <WarningCircle size={44} weight="duotone" className="sx-err-icon" aria-hidden />
        <h1 className="sx-process-title">Analysis did not complete</h1>
        <p className="sx-process-file">{errorMsg}</p>
        <p className="sx-foot">Check that the PDF is under 100 MB, unlocked, and clearly readable (300 DPI for scans).</p>
        <button className="sx-go" onClick={reset}>
          Try again
        </button>
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
