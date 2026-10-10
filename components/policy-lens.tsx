'use client'

import { useState, useCallback } from 'react'
import { UploadScreen } from './policy/UploadScreen'
import { ProcessingTimeline } from './policy/ProcessingTimeline'
import { PolicyResults } from './policy/PolicyResults'
import type { PolicyAnalysisResult } from '@/lib/types/policy'
import { WarningCircle } from '@phosphor-icons/react'

type AppState = 'upload' | 'processing' | 'results' | 'error'

export default function PolicyLens() {
  const [state, setState] = useState<AppState>('upload')
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState<PolicyAnalysisResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleAnalyze = useCallback(async (file: File) => {
    setFileName(file.name)
    setState('processing')
    setErrorMsg(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/policy/analyze', {
        method: 'POST',
        body: formData,
      })

      const json = await res.json()

      if (!res.ok || !json.success) {
        throw new Error(json.error || `Server error: ${res.status}`)
      }

      setResult(json.data)
      setState('results')
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unexpected error during analysis.')
      setState('error')
    }
  }, [])

  const handleLoadSample = useCallback((sample: PolicyAnalysisResult, name: string) => {
    setFileName(name)
    setState('processing')
    setErrorMsg(null)
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
    return <ProcessingTimeline fileName={fileName} />
  }

  if (state === 'error') {
    return (
      <div className="sx-process" role="alert">
        <WarningCircle size={44} weight="duotone" className="sx-err-icon" aria-hidden />
        <h1 className="sx-process-title">That did not work</h1>
        <p className="sx-process-file">{errorMsg}</p>
        <p className="sx-foot">Check the PDF is not password-locked and is under 100 MB.</p>
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
