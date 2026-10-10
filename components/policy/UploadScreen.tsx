'use client'

import { useCallback, useRef, useState } from 'react'
import { ArrowRight, CheckCircle, FilePdf, UploadSimple, Warning, X } from '@phosphor-icons/react'
import { UserMenu } from '@/components/ui/UserMenu'
import { Brand } from '@/components/ui/Brand'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { SAMPLE_POLICIES } from '@/lib/policy/samplePolicies'
import type { PolicyAnalysisResult } from '@/lib/types/policy'

interface UploadScreenProps {
  onAnalyze: (file: File) => void
  onLoadSample?: (sample: PolicyAnalysisResult, fileName: string) => void
}

const SAMPLES = [
  { key: 'hdfc_optima', file: 'HDFC_ERGO_Optima_Secure.pdf', name: 'HDFC ERGO Optima', meta: '₹5L cover' },
  { key: 'star_health', file: 'Star_Comprehensive_Health.pdf', name: 'Star Health Comprehensive', meta: '₹10L cover' },
]

export function UploadScreen({ onAnalyze, onLoadSample }: UploadScreenProps) {
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = (f: File) => {
    setError(null)
    if (!f.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files work.')
      return
    }
    if (f.size > 100 * 1024 * 1024) {
      setError('That file is over 100 MB.')
      return
    }
    setFile(f)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [])

  const formatSize = (bytes: number) =>
    bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`

  return (
    <div className="sx-upload">
      <header className="sx-top">
        <Brand size={36} />
        <div className="sx-top-actions">
          <ThemeToggle />
          <UserMenu />
        </div>
      </header>

      <main className="sx-upload-main">
        <h1 className="sx-upload-title">Let&rsquo;s read your policy.</h1>
        <p className="sx-upload-sub">Add the PDF. Know what you will pay.</p>

        <div
          className={`sx-drop ${dragging ? 'is-drag' : ''} ${file ? 'is-ready' : ''}`}
          onDrop={onDrop}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onClick={() => !file && inputRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="Choose your policy PDF"
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !file && inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
          />
          {file ? (
            <div className="sx-drop-file">
              <FilePdf size={34} weight="duotone" aria-hidden />
              <div>
                <strong>{file.name}</strong>
                <span>{formatSize(file.size)}</span>
              </div>
              <button
                type="button"
                className="sx-drop-x"
                aria-label="Remove file"
                onClick={(e) => {
                  e.stopPropagation()
                  setFile(null)
                }}
              >
                <X size={18} weight="bold" aria-hidden />
              </button>
            </div>
          ) : (
            <div className="sx-drop-empty">
              <span className="sx-drop-icon" aria-hidden>
                <UploadSimple size={30} weight="bold" />
              </span>
              <strong>{dragging ? 'Drop it here' : 'Tap to choose your PDF'}</strong>
              <span>or drag it in</span>
            </div>
          )}
        </div>

        {error && (
          <p className="sx-note sx-note-warn" role="alert">
            <Warning size={18} weight="bold" aria-hidden /> {error}
          </p>
        )}

        <button type="button" className="sx-go" disabled={!file} onClick={() => file && onAnalyze(file)}>
          Read my policy
          <ArrowRight size={22} weight="bold" aria-hidden />
        </button>

        {onLoadSample && (
          <div className="sx-samples">
            <p>No PDF handy? Try a sample.</p>
            <div>
              {SAMPLES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className="sx-sample"
                  onClick={() => SAMPLE_POLICIES[s.key] && onLoadSample(SAMPLE_POLICIES[s.key], s.file)}
                >
                  <CheckCircle size={20} weight="duotone" aria-hidden />
                  <span>
                    <strong>{s.name}</strong>
                    <small>{s.meta}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="sx-foot">Your PDF is read in memory and never stored.</p>
      </main>
    </div>
  )
}
