'use client'

import { useState, useCallback } from 'react'
import { UploadScreen } from './policy/UploadScreen'
import { ProcessingTimeline } from './policy/ProcessingTimeline'
import { PolicyResults } from './policy/PolicyResults'
import type { PolicyAnalysisResult } from '@/lib/types/policy'
import { AlertTriangle } from 'lucide-react'

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

  const reset = () => {
    setState('upload')
    setResult(null)
    setErrorMsg(null)
    setFileName('')
  }

  if (state === 'upload') {
    return <UploadScreen onAnalyze={handleAnalyze} />
  }

  if (state === 'processing') {
    return <ProcessingTimeline fileName={fileName} />
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
