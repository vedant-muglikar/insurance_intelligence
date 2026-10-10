'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, ScanLine, X } from 'lucide-react'
import Loader from '../ui/loader-4'
import OnboardCard from '../ui/onboard-card'
import type { AnalysisStage } from '@/lib/types/policy'
import type { AnalysisProgressState, PageProgress } from '@/lib/client/analyzePolicyUpload'

interface ProcessingTimelineProps {
  fileName: string
  /** Live server progress. When absent (sample presets) a simulated timeline is shown. */
  progress?: AnalysisProgressState
  onCancel?: () => void
}

const STEPS = [
  { label: 'Reading document bytes', detail: 'Extracting text layer and page structure with pdfjs' },
  { label: 'Normalizing clause syntax', detail: 'Tokenizing waiting periods, sub-limits, and exclusions' },
  { label: 'Deterministic rule compiler', detail: 'Building typed conditions, room limits, and co-pay predicates' },
  { label: 'Cross-verifying evidence citations', detail: 'Validating quotes against exact page character offsets' },
  { label: 'Calibrating preflight engine', detail: 'Linking hospital tariffs & pre-authorization readiness checklist' },
]

const SIMULATED_CLAUSES = [
  'Extracting: Section 1 (Sum Insured Ceiling)',
  'Parsing: Section 4.1 (24-Month Specific Illness Waiting)',
  'Compiling: Section 2.1 (Single Private Room Cap)',
  'Validating: Section 5.3 (Senior Citizen 20% Co-pay)',
  'Checking: Section 4.3 (Permanent Cosmetic Exclusions)',
  'Verifying: Citation Page 11 quote overlap > 85%',
  'Finalizing: Clause-to-Rupee audit ledger initialized',
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

// ─── Live (server-driven) stages ──────────────────────────────────────────────

const LIVE_STEPS: { key: 'upload' | AnalysisStage; label: string; detail: string }[] = [
  { key: 'upload', label: 'Uploading document', detail: 'Sending the PDF to the analysis server' },
  { key: 'text_extraction', label: 'Reading embedded text layer', detail: 'Existing text extraction for digital pages' },
  { key: 'page_detection', label: 'Detecting scanned pages', detail: 'Checking each page for readable embedded text' },
  { key: 'ocr', label: 'OCR on scanned pages', detail: 'Deskew, contrast enhancement and Tesseract OCR, page by page' },
  { key: 'ai_analysis', label: 'AI policy analysis', detail: 'Extracting coverage, limits, exclusions and waiting periods' },
  { key: 'evidence_validation', label: 'Validating evidence citations', detail: 'Matching every quote to its source page' },
]

function liveStepIndex(progress: AnalysisProgressState): number {
  if (progress.phase === 'uploading' || !progress.stage) return 0
  const stage = progress.stage === 'validating' ? 'text_extraction' : progress.stage
  if (stage === 'complete') return LIVE_STEPS.length
  return Math.max(1, LIVE_STEPS.findIndex((s) => s.key === stage))
}

function pageTone(p: PageProgress | undefined): { cls: string; label: string } {
  if (!p) return { cls: 'bg-slate-900 text-slate-600 border-slate-800', label: 'Pending' }
  if (p.status === 'ocr_started') return { cls: 'bg-cyan-500/30 text-cyan-200 border-cyan-400 animate-pulse', label: 'OCR running' }
  if (p.method === 'failed' || p.ocr_quality === 'unreadable') return { cls: 'bg-red-950 text-red-300 border-red-700', label: 'Unreadable — needs clearer scan' }
  if (p.needs_clearer_scan || p.ocr_quality === 'poor') return { cls: 'bg-amber-950 text-amber-300 border-amber-700', label: 'Low OCR confidence' }
  if (p.method === 'ocr' && p.status === 'detected') return { cls: 'bg-slate-900 text-cyan-400 border-cyan-900', label: 'Scanned — queued for OCR' }
  if (p.method === 'hybrid' && p.status === 'detected') return { cls: 'bg-slate-900 text-violet-400 border-violet-900', label: 'Text + images — queued for OCR' }
  if (p.method === 'ocr') return { cls: 'bg-cyan-950 text-cyan-300 border-cyan-700', label: 'Extracted with OCR' }
  if (p.method === 'hybrid') return { cls: 'bg-violet-950 text-violet-300 border-violet-700', label: 'Text layer + OCR of images' }
  return { cls: 'bg-emerald-950 text-emerald-300 border-emerald-800', label: 'Embedded text' }
}

function LiveProgress({ progress, onCancel }: { progress: AnalysisProgressState; onCancel?: () => void }) {
  const stepIndex = liveStepIndex(progress)
  const overallPct =
    progress.phase === 'uploading'
      ? Math.round(progress.uploadPct * 0.1)
      : Math.min(100, Math.round(10 + progress.progress * 0.9))

  const pageList = useMemo(
    () => Array.from({ length: progress.totalPages }, (_, i) => progress.pages[i + 1]),
    [progress.pages, progress.totalPages],
  )
  const ocrPages = pageList.filter((p) => p && p.method !== 'text_layer')
  const ocrDone = ocrPages.filter((p) => p && (p.status === 'ocr_done' || p.status === 'done')).length
  const rescanPages = pageList.filter((p) => p && (p.needs_clearer_scan || p.method === 'failed')).map((p) => p!.page_number)
  const sawOcrStage = progress.seenStages.includes('ocr')

  const latestPreview = [...pageList].reverse().find((p) => p?.preview)?.page_number
  const [selectedPage, setSelectedPage] = useState<number | null>(null)
  const shownPage = progress.pages[selectedPage ?? latestPreview ?? -1]

  return (
    <>
      {/* Progress Bar & Percentage */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-xs gap-3">
          <span className="text-slate-400 font-medium truncate" aria-live="polite">{progress.message}</span>
          <span className="text-emerald-400 font-bold font-mono shrink-0">{overallPct}%</span>
        </div>
        <div
          className="w-full h-2 rounded-full bg-slate-900 overflow-hidden border border-slate-800"
          role="progressbar"
          aria-valuenow={overallPct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 transition-all duration-500 ease-out shadow-sm shadow-emerald-500"
            style={{ width: `${overallPct}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-3 pt-1">
        {LIVE_STEPS.map((step, idx) => {
          const done = idx < stepIndex
          const active = idx === stepIndex
          let detail = step.detail
          if (step.key === 'upload' && active) detail = `${progress.uploadPct}% uploaded`
          if (step.key === 'ocr') {
            if (ocrPages.length > 0) detail = `${ocrDone} of ${ocrPages.length} scanned/image page(s) processed`
            else if (done && !sawOcrStage) detail = 'Not needed — every page has embedded text'
          }
          if (step.key === 'page_detection' && progress.totalPages > 0) {
            detail = `${Object.keys(progress.pages).length} of ${progress.totalPages} pages checked`
          }
          return (
            <div key={step.key} className="flex items-start gap-3 text-xs">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                  done
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-600'
                    : active
                    ? 'bg-emerald-500 text-slate-950 font-bold animate-pulse'
                    : 'bg-slate-900 text-slate-600 border border-slate-800'
                }`}
              >
                {done ? <Check size={12} strokeWidth={3} /> : idx + 1}
              </span>
              <div className="space-y-0.5 min-w-0">
                <div className={`font-semibold ${done ? 'text-slate-300' : active ? 'text-white' : 'text-slate-500'}`}>
                  {step.label}
                </div>
                {(active || (done && (step.key === 'ocr' || step.key === 'page_detection'))) && (
                  <div className={`text-[11px] ${active ? 'text-emerald-400/90' : 'text-slate-500'}`}>{detail}</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Per-page status grid */}
      {progress.totalPages > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <ScanLine size={12} className="text-cyan-400" /> Pages ({progress.totalPages})
            </span>
            <span className="flex gap-2 flex-wrap justify-end">
              <span className="text-emerald-400">■ text</span>
              <span className="text-cyan-400">■ OCR</span>
              <span className="text-violet-400">■ hybrid</span>
              <span className="text-amber-400">■ low conf.</span>
              <span className="text-red-400">■ unreadable</span>
            </span>
          </div>
          <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto pr-1">
            {pageList.map((p, i) => {
              const tone = pageTone(p)
              const n = i + 1
              return (
                <button
                  key={n}
                  type="button"
                  title={`Page ${n}: ${tone.label}${p?.ocr_confidence !== undefined ? ` (${p.ocr_confidence}% confidence)` : ''}`}
                  onClick={() => setSelectedPage(n)}
                  className={`w-7 h-7 rounded text-[10px] font-mono border transition-colors ${tone.cls} ${
                    (selectedPage ?? latestPreview) === n ? 'ring-1 ring-white/60' : ''
                  }`}
                >
                  {n}
                </button>
              )
            })}
          </div>

          {rescanPages.length > 0 && (
            <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-950/40 border border-amber-800/60 text-[11px] text-amber-200">
              <AlertTriangle size={13} className="shrink-0 mt-0.5 text-amber-400" />
              <span>
                Page{rescanPages.length > 1 ? 's' : ''} {rescanPages.join(', ')} could not be read reliably. Results for{' '}
                {rescanPages.length > 1 ? 'these pages' : 'this page'} will be marked uncertain — a clearer scan (300 DPI+) is recommended.
              </span>
            </div>
          )}

          {shownPage && (
            <div className="rounded-lg bg-slate-950/80 border border-slate-800 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-slate-400">PAGE {shownPage.page_number} · {pageTone(shownPage).label}</span>
                {shownPage.ocr_confidence !== undefined && (
                  <span className="text-cyan-300">{shownPage.ocr_confidence}% OCR confidence</span>
                )}
              </div>
              {shownPage.warnings?.map((w) => (
                <div key={w} className="text-[10px] text-amber-300">⚠ {w}</div>
              ))}
              {shownPage.preview ? (
                <pre className="text-[10px] leading-relaxed text-slate-300 whitespace-pre-wrap max-h-24 overflow-y-auto font-mono">
                  {shownPage.preview}
                  {shownPage.preview.length >= 300 ? '…' : ''}
                </pre>
              ) : (
                <div className="text-[10px] text-slate-500">{shownPage.reason ?? 'Waiting for extraction…'}</div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-800">
        <p className="text-[11px] text-slate-500">
          Documents are processed in memory and never stored. Please keep this tab open.
        </p>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            <X size={12} /> Cancel
          </button>
        )}
      </div>
    </>
  )
}

// ─── Simulated timeline (sample presets) ─────────────────────────────────────

function SimulatedProgress() {
  const [currentStep, setCurrentStep] = useState(0)
  const [clauseIndex, setClauseIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep((s) => {
        if (s < STEPS.length - 1) return s + 1
        return s
      })
    }, 1800)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const ticker = setInterval(() => {
      setClauseIndex((i) => (i + 1) % SIMULATED_CLAUSES.length)
    }, 900)
    return () => clearInterval(ticker)
  }, [])

  const progressPct = Math.round(((currentStep + 1) / STEPS.length) * 100)
  const onboard = ONBOARD_STEPS[Math.min(currentStep, ONBOARD_STEPS.length - 1)]

  return (
    <>
      {/* OnboardCard Animation */}
      <div className="flex justify-center my-2">
        <OnboardCard
          key={currentStep}
          duration={4000}
          step1={onboard.step1}
          step2={onboard.step2}
          step3={onboard.step3}
        />
      </div>

      {/* Progress Bar & Percentage */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-400 font-medium">Deterministic Rule Compilation</span>
          <span className="text-emerald-400 font-bold font-mono">{progressPct}%</span>
        </div>
        <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden border border-slate-800">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 transition-all duration-500 ease-out shadow-sm shadow-emerald-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Active Clause Scanning HUD Ticker */}
      <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 flex items-center gap-2.5 text-[11px] font-mono">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
        <span className="text-slate-500 shrink-0">SCANNING:</span>
        <span className="text-emerald-300 truncate">
          {SIMULATED_CLAUSES[clauseIndex]}
        </span>
      </div>

      {/* Steps Timeline */}
      <div className="space-y-3 pt-1">
        {STEPS.map((step, idx) => {
          const done = idx < currentStep
          const active = idx === currentStep

          return (
            <div key={step.label} className="flex items-start gap-3 text-xs">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                  done
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-600'
                    : active
                    ? 'bg-emerald-500 text-slate-950 font-bold animate-pulse'
                    : 'bg-slate-900 text-slate-600 border border-slate-800'
                }`}
              >
                {done ? <Check size={12} strokeWidth={3} /> : idx + 1}
              </span>

              <div className="space-y-0.5">
                <div
                  className={`font-semibold ${
                    done
                      ? 'text-slate-300'
                      : active
                      ? 'text-white'
                      : 'text-slate-500'
                  }`}
                >
                  {step.label}
                </div>
                {active && (
                  <div className="text-[11px] text-emerald-400/90 animate-in fade-in duration-300">
                    {step.detail}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-[11px] text-center text-slate-500 pt-2 border-t border-slate-800">
        Generating auditable Clause-to-Rupee ledger. Please keep this tab open.
      </p>
    </>
  )
}

export function ProcessingTimeline({ fileName, progress, onCancel }: ProcessingTimelineProps) {
  const badge = progress
    ? progress.phase === 'uploading'
      ? 'Uploading'
      : progress.stage === 'ocr'
      ? 'OCR'
      : 'Compiling'
    : 'Compiling'

  return (
    <div className="processing-wrapper relative overflow-hidden flex items-center justify-center min-h-[85vh] p-4">
      {/* Ambient glowing aurora circles */}

      <div className="processing-card glass-panel relative z-10 max-w-xl w-full p-6 sm:p-8 rounded-2xl border border-slate-700/60 shadow-2xl space-y-6">
        {/* Header with Loader & Brand */}
        <div className="flex items-center gap-4">
          <div className="shrink-0">
            <Loader />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white tracking-tight">PolicyLens Policy Engine</h2>
              <span className="text-[11px] uppercase px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                Compiling
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono truncate max-w-xs sm:max-w-sm mt-0.5">
              {fileName}
            </p>
          </div>
        </div>

        {progress ? <LiveProgress progress={progress} onCancel={onCancel} /> : <SimulatedProgress />}
      </div>
    </div>
  )
}
