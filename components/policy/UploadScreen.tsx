'use client'

import { useCallback, useRef, useState } from 'react'
import {
  CloudUpload,
  FileCheck2,
  X,
  AlertTriangle,
  Shield,
  Clock,
  FileSearch,
  ArrowRight,
  Sparkles,
  Zap,
} from 'lucide-react'
import { SAMPLE_POLICIES } from '@/lib/policy/samplePolicies'
import type { PolicyAnalysisResult } from '@/lib/types/policy'

interface UploadScreenProps {
  onAnalyze: (file: File) => void
  onLoadSample?: (sample: PolicyAnalysisResult, fileName: string) => void
}

const TRUST_ITEMS = [
  { icon: Shield, label: 'Every rupee cited', sub: 'Page & section evidence cross-verified' },
  { icon: Clock, label: 'Under 60 seconds', sub: 'From 50-page PDF to auditable preflight' },
  { icon: FileSearch, label: 'Deterministic Engine', sub: 'Waiting period math & room proration run in code' },
]

export function UploadScreen({ onAnalyze, onLoadSample }: UploadScreenProps) {
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

  const handleSelectSample = (key: string, name: string) => {
    const sample = SAMPLE_POLICIES[key]
    if (sample && onLoadSample) {
      onLoadSample(sample, name)
    }
  }

  return (
    <div className="us-root relative overflow-hidden">
      {/* ── Ambient Glow Auroras ── */}
      <div className="aurora-bg w-96 h-96 -top-24 -left-24 bg-emerald-500/20" />
      <div className="aurora-bg w-96 h-96 -bottom-24 -right-24 bg-cyan-500/15" />

      {/* ── Subtle grid background ── */}
      <div className="us-grid-bg" />

      {/* ── Top bar ── */}
      <div className="us-topbar">
        <div className="lp-nav-brand">
          <div className="brand-mark small">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          </div>
          <span className="lp-nav-name">Claim<span className="lp-accent">Lens</span></span>
        </div>
        <a href="/" className="us-back-link">
          ← Back to home
        </a>
      </div>

      {/* ── Main layout: left context / right upload ── */}
      <div className="us-main">

        {/* LEFT — context panel */}
        <div className="us-left">
          <div className="us-left-inner">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                Preflight Ingestion
              </span>
            </div>
            <h1 className="us-left-headline">
              Upload your policy.<br />
              Audit every clause.
            </h1>
            <p className="us-left-body">
              Drop any Indian health insurance PDF. Our policy compiler extracts coverage,
              waiting periods, and sub-limits into executable code — giving you a Clause-to-Rupee
              preflight before hospital admission.
            </p>

            <div className="us-trust-list">
              {TRUST_ITEMS.map(({ icon: Icon, label, sub }) => (
                <div key={label} className="us-trust-item">
                  <div className="us-trust-icon">
                    <Icon size={15} />
                  </div>
                  <div>
                    <div className="us-trust-label">{label}</div>
                    <div className="us-trust-sub">{sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT — upload panel */}
        <div className="us-right">
          <div className="us-panel glass-panel">
            <div className="us-panel-header">
              <span className="us-panel-title">Upload Policy Document</span>
              <span className="us-panel-sub">PDF wording, up to 100 MB</span>
            </div>

            {/* Drop zone with animated scanning effect */}
            <div
              className={`us-zone relative overflow-hidden transition-all duration-300 ${
                dragging ? 'us-zone-drag border-emerald-400 bg-emerald-950/20 scale-[1.01]' : ''
              } ${file ? 'us-zone-ready' : ''}`}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onClick={() => !file && inputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
            >
              {/* Subtle radar sweep on idle */}
              {!file && <div className="radar-sweep absolute inset-0 pointer-events-none opacity-20" />}

              <input
                ref={inputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              />

              {file ? (
                <div className="us-zone-file relative z-10">
                  <FileCheck2 size={24} className="us-zone-file-icon text-emerald-400" />
                  <div className="us-zone-file-info">
                    <div className="us-zone-file-name font-semibold">{file.name}</div>
                    <div className="us-zone-file-size text-emerald-400">{formatSize(file.size)} · Ready to analyze</div>
                  </div>
                  <button
                    className="us-zone-remove"
                    onClick={(e) => { e.stopPropagation(); setFile(null) }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="us-zone-empty relative z-10">
                  <div className={`us-zone-icon ${dragging ? 'us-zone-icon-drag scale-110' : ''}`}>
                    <CloudUpload size={24} />
                  </div>
                  <div className="us-zone-text font-medium">
                    {dragging ? 'Drop PDF here' : 'Drag & drop your policy PDF or click to browse'}
                  </div>
                  <div className="us-zone-hint">Digitally verified text extraction with page citation validation</div>
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="us-error">
                <AlertTriangle size={13} />
                {error}
              </div>
            )}

            {/* CTA */}
            <button
              className="us-cta sheen-wrapper font-semibold"
              disabled={!file}
              onClick={() => file && onAnalyze(file)}
            >
              <Sparkles size={15} />
              Analyze Policy & Compile Rules
              <ArrowRight size={15} className="us-cta-arrow" />
            </button>

            {/* Instant Demo Presets for Hackathon Testing */}
            {onLoadSample && (
              <div className="pt-3 border-t border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="font-semibold text-slate-300 flex items-center gap-1">
                    <Zap size={12} className="text-amber-400" />
                    Instant Demo Presets (1-Click Test):
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectSample('hdfc_optima', 'HDFC_ERGO_Optima_Secure.pdf')}
                    className="text-left p-2 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 hover:border-emerald-500/50 transition-colors text-xs space-y-0.5 group"
                  >
                    <span className="font-semibold text-slate-200 group-hover:text-emerald-300 block truncate">
                      HDFC ERGO Optima Secure
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      ₹5L SI · 24M Joint Wait · 20% Senior Co-pay
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectSample('star_health', 'Star_Comprehensive_Health.pdf')}
                    className="text-left p-2 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 hover:border-emerald-500/50 transition-colors text-xs space-y-0.5 group"
                  >
                    <span className="font-semibold text-slate-200 group-hover:text-emerald-300 block truncate">
                      Star Health Comprehensive
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      ₹10L SI · 36M PED Wait · Suite Proration
                    </span>
                  </button>
                </div>
              </div>
            )}

            <p className="us-disclaimer">
              Strict client privacy: Documents are parsed in temporary memory and never persisted or shared.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
