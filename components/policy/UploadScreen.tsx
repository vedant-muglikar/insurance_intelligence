'use client'

import { useCallback, useRef, useState } from 'react'
import {
  CloudUpload,
  FileCheck2,
  FileSearch,
  Sparkles,
  X,
  AlertTriangle,
} from 'lucide-react'

interface UploadScreenProps {
  onAnalyze: (file: File) => void
}

export function UploadScreen({ onAnalyze }: UploadScreenProps) {
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = (f: File) => {
    setError(null)
    if (!f.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files are supported.')
      return
    }
    if (f.size > 100 * 1024 * 1024) {
      setError('File exceeds 100 MB.')
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

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }

  const onDragLeave = () => setDragging(false)

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="upload-screen-wrapper">
      <div className="upload-screen-inner">
        {/* Brand */}
        <div className="upload-brand">
          <div className="brand-mark">
            <Sparkles size={18} />
          </div>
          <div>
            <div className="upload-brand-name">
              Policy<span className="text-emerald-400">Lens</span>
            </div>
            <div className="upload-brand-sub">Insurance Policy Intelligence</div>
          </div>
        </div>

        <h1 className="upload-title">
          Understand your insurance policy in seconds
        </h1>
        <p className="upload-subtitle">
          Upload any health insurance PDF and our AI will extract every coverage
          rule, exclusion, limit, waiting period and more — with source evidence.
        </p>

        {/* Drop zone */}
        <div
          className={`upload-zone large ${dragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => !file && inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
          />

          <div
            className={`upload-icon-wrap ${file ? 'success' : dragging ? 'active' : ''}`}
          >
            {file ? (
              <FileCheck2 size={28} />
            ) : (
              <CloudUpload size={28} />
            )}
          </div>

          {file ? (
            <>
              <div className="upload-filename">{file.name}</div>
              <div className="upload-filemeta">
                {formatSize(file.size)} · Ready to analyze
              </div>
            </>
          ) : (
            <>
              <div className="upload-drop-title">
                {dragging ? 'Drop your PDF here' : 'Drag & drop your PDF here'}
              </div>
              <div className="upload-drop-sub">or click to browse files</div>
              <div className="upload-drop-hint">
                Supports PDF documents up to 100 MB
              </div>
            </>
          )}
        </div>

        {/* File pill */}
        {file && (
          <div className="upload-pill">
            <FileSearch size={14} className="text-emerald-400 shrink-0" />
            <span className="truncate text-xs text-slate-300">{file.name}</span>
            <button
              className="ml-auto shrink-0 text-slate-500 hover:text-white"
              onClick={(e) => {
                e.stopPropagation()
                setFile(null)
              }}
            >
              <X size={13} />
            </button>
          </div>
        )}

        {error && (
          <div className="upload-error">
            <AlertTriangle size={14} />
            {error}
          </div>
        )}

        <button
          className="button-primary upload-cta"
          disabled={!file}
          onClick={() => file && onAnalyze(file)}
        >
          <Sparkles size={16} />
          Analyze policy
        </button>

        {/* Feature chips */}
        <div className="upload-features">
          {[
            'Page-by-page extraction',
            'AI rule detection',
            'Evidence validation',
            'Source citations',
          ].map((f) => (
            <span key={f} className="upload-feature-chip">
              {f}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
