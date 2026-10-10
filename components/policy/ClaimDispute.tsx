'use client'

import { useState, useRef } from 'react'
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Plus,
  X,
  Loader2,
  Download,
  ChevronDown,
  ChevronUp,
  Scale,
  FileText,
  AlertTriangle,
  BookOpen,
  ArrowRight,
  Sparkles,
} from 'lucide-react'
import type {
  ExtractedPage,
  DisputeAnalysis,
  DisputeArgument,
} from '@/lib/types/policy'

interface ClaimDisputeProps {
  pages: ExtractedPage[]
}

// ─── Verdict badge ─────────────────────────────────────────────────────────────

function VerdictBadge({ verdict }: { verdict: DisputeAnalysis['verdict'] }) {
  const config = {
    disputable: {
      icon: ShieldCheck,
      label: 'Claim is Disputable',
      bg: 'bg-emerald-500/15',
      border: 'border-emerald-500/30',
      text: 'text-emerald-300',
      glow: 'shadow-[0_0_20px_rgba(52,211,153,0.1)]',
    },
    partially_disputable: {
      icon: ShieldAlert,
      label: 'Partially Disputable',
      bg: 'bg-amber-500/15',
      border: 'border-amber-500/30',
      text: 'text-amber-300',
      glow: 'shadow-[0_0_20px_rgba(245,158,11,0.1)]',
    },
    not_disputable: {
      icon: ShieldX,
      label: 'Not Disputable',
      bg: 'bg-red-500/15',
      border: 'border-red-500/30',
      text: 'text-red-300',
      glow: 'shadow-[0_0_20px_rgba(239,68,68,0.1)]',
    },
  }
  const c = config[verdict]
  const Icon = c.icon

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-5 py-3 ${c.bg} ${c.border} ${c.glow}`}
    >
      <Icon size={22} className={c.text} />
      <span className={`text-base font-bold ${c.text}`}>{c.label}</span>
    </div>
  )
}

// ─── Strength pill ─────────────────────────────────────────────────────────────

function StrengthPill({ strength }: { strength: DisputeArgument['strength'] }) {
  const colors = {
    strong: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    moderate: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    weak: 'bg-red-500/20 text-red-300 border-red-500/40',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${colors[strength]}`}
    >
      {strength}
    </span>
  )
}

// ─── Argument card ─────────────────────────────────────────────────────────────

function ArgumentCard({ arg, index }: { arg: DisputeArgument; index: number }) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-900/50 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-slate-800/30 transition-colors"
      >
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-xs font-bold text-slate-300 mt-0.5">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <StrengthPill strength={arg.strength} />
          </div>
          <p className="text-sm font-medium text-slate-200 line-clamp-2">
            Rejection: &quot;{arg.rejection_reason}&quot;
          </p>
        </div>
        {expanded ? (
          <ChevronUp size={16} className="text-slate-400 mt-1 shrink-0" />
        ) : (
          <ChevronDown size={16} className="text-slate-400 mt-1 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-slate-800 px-5 py-4 space-y-4">
          {/* Counter argument */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Scale size={14} className="text-emerald-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                Counter Argument
              </span>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              {arg.counter_argument}
            </p>
          </div>

          {/* Supporting clauses */}
          {arg.supporting_clauses && arg.supporting_clauses.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <BookOpen size={14} className="text-cyan-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                  Policy Evidence ({arg.supporting_clauses.length} citation
                  {arg.supporting_clauses.length > 1 ? 's' : ''})
                </span>
              </div>
              <div className="space-y-2">
                {arg.supporting_clauses.map((clause, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-slate-700/60 bg-slate-800/40 px-4 py-3"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[11px] font-bold text-cyan-300">
                        Page {clause.page_number}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {clause.section_name}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 italic leading-relaxed">
                      &ldquo;{clause.evidence_text}&rdquo;
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Legal basis */}
          {arg.legal_basis && (
            <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <FileText size={12} className="text-indigo-400" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-400">
                  Legal/Regulatory Basis
                </span>
              </div>
              <p className="text-xs text-indigo-200">{arg.legal_basis}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── PDF generation ────────────────────────────────────────────────────────────

function generateDisputePDF(analysis: DisputeAnalysis, treatmentName?: string) {
  // Build a printable HTML document and trigger browser print/save-as-PDF
  const verdictLabel = {
    disputable: '✅ CLAIM IS DISPUTABLE',
    partially_disputable: '⚠️ PARTIALLY DISPUTABLE',
    not_disputable: '❌ NOT DISPUTABLE',
  }

  const strengthEmoji = { strong: '🟢', moderate: '🟡', weak: '🔴' }

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Claim Dispute Report — PolicyLens</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1a1a2e; padding: 40px; max-width: 800px; margin: 0 auto; line-height: 1.6; }
    .header { text-align: center; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 2px solid #e0e0e0; }
    .header h1 { font-size: 22px; color: #1a1a2e; margin-bottom: 4px; }
    .header p { font-size: 12px; color: #666; }
    .verdict { text-align: center; font-size: 18px; font-weight: 700; margin: 20px 0; padding: 16px; border-radius: 8px; background: #f0f4f8; }
    .summary { background: #f8fafc; border-left: 4px solid #3b82f6; padding: 16px; margin: 20px 0; border-radius: 0 8px 8px 0; font-size: 14px; }
    .argument { margin: 24px 0; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; page-break-inside: avoid; }
    .argument h3 { font-size: 14px; color: #dc2626; margin-bottom: 8px; }
    .counter { margin: 12px 0; }
    .counter h4 { font-size: 12px; color: #059669; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
    .counter p { font-size: 13px; }
    .citation { background: #f1f5f9; padding: 12px; border-radius: 6px; margin: 8px 0; font-size: 12px; }
    .citation .page { color: #0891b2; font-weight: 600; }
    .citation .quote { font-style: italic; color: #475569; margin-top: 4px; }
    .legal { background: #eef2ff; border-left: 3px solid #6366f1; padding: 10px 14px; margin: 10px 0; font-size: 12px; color: #4338ca; border-radius: 0 6px 6px 0; }
    .actions { margin: 24px 0; }
    .actions h3 { font-size: 14px; margin-bottom: 10px; }
    .actions ol { padding-left: 20px; }
    .actions li { font-size: 13px; margin-bottom: 6px; }
    .disclaimer { margin-top: 32px; padding: 16px; background: #fef3cd; border-radius: 8px; font-size: 11px; color: #856404; }
    .footer { text-align: center; margin-top: 40px; font-size: 10px; color: #999; border-top: 1px solid #e0e0e0; padding-top: 16px; }
    .strength { display: inline-block; font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 2px 8px; border-radius: 4px; }
    @media print { body { padding: 20px; } .argument { page-break-inside: avoid; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>🛡️ Claim Dispute Report</h1>
    <p>Generated by PolicyLens Insurance Intelligence • ${new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
    ${treatmentName ? `<p style="margin-top:4px;font-weight:600;">Treatment: ${treatmentName}</p>` : ''}
  </div>

  <div class="verdict">${verdictLabel[analysis.verdict]}</div>

  <div class="summary">${analysis.verdict_summary}</div>`

  analysis.arguments.forEach((arg, i) => {
    html += `
  <div class="argument">
    <h3>${strengthEmoji[arg.strength]} Rejection Reason ${i + 1}: "${arg.rejection_reason}"</h3>
    <span class="strength">${arg.strength.toUpperCase()} ARGUMENT</span>

    <div class="counter">
      <h4>Counter Argument</h4>
      <p>${arg.counter_argument}</p>
    </div>`

    if (arg.supporting_clauses?.length) {
      arg.supporting_clauses.forEach((clause) => {
        html += `
    <div class="citation">
      <span class="page">📄 Page ${clause.page_number} — ${clause.section_name}</span>
      <div class="quote">"${clause.evidence_text}"</div>
    </div>`
      })
    }

    if (arg.legal_basis) {
      html += `
    <div class="legal">⚖️ ${arg.legal_basis}</div>`
    }

    html += `
  </div>`
  })

  if (analysis.recommended_actions?.length) {
    html += `
  <div class="actions">
    <h3>📋 Recommended Actions</h3>
    <ol>${analysis.recommended_actions.map((a) => `<li>${a}</li>`).join('')}</ol>
  </div>`
  }

  html += `
  <div class="disclaimer">⚠️ ${analysis.disclaimer}</div>
  <div class="footer">This report is generated by PolicyLens AI and should be reviewed by a qualified insurance advisor or legal professional before submission.</div>
</body>
</html>`

  // Open in new window and trigger print
  const printWindow = window.open('', '_blank')
  if (printWindow) {
    printWindow.document.write(html)
    printWindow.document.close()
    setTimeout(() => printWindow.print(), 500)
  }
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function ClaimDispute({ pages }: ClaimDisputeProps) {
  const [reasons, setReasons] = useState<string[]>([''])
  const [treatmentName, setTreatmentName] = useState('')
  const [claimAmount, setClaimAmount] = useState('')
  const [rejectionLetterText, setRejectionLetterText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<DisputeAnalysis | null>(null)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const addReason = () => {
    setReasons([...reasons, ''])
    setTimeout(() => {
      inputRefs.current[reasons.length]?.focus()
    }, 50)
  }

  const removeReason = (index: number) => {
    if (reasons.length <= 1) return
    setReasons(reasons.filter((_, i) => i !== index))
  }

  const updateReason = (index: number, value: string) => {
    const updated = [...reasons]
    updated[index] = value
    setReasons(updated)
  }

  const handleSubmit = async () => {
    const validReasons = reasons.filter((r) => r.trim().length > 0)
    if (validReasons.length === 0) {
      setError('Please enter at least one rejection reason.')
      return
    }

    setLoading(true)
    setError(null)
    setAnalysis(null)

    try {
      const res = await fetch('/api/claim-dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rejection_reasons: validReasons,
          treatment_name: treatmentName || undefined,
          claim_amount: claimAmount || undefined,
          rejection_letter_text: rejectionLetterText || undefined,
          pages,
        }),
      })

      const json = await res.json()

      if (!res.ok || !json.success) {
        throw new Error(json.error || `Server error: ${res.status}`)
      }

      setAnalysis(json.data)
    } catch (err: any) {
      setError(err?.message || 'Unexpected error during dispute analysis.')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setAnalysis(null)
    setError(null)
  }

  // ─── Results view ──────────────────────────────────────────────────────────

  if (analysis) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        {/* Verdict header */}
        <div className="flex flex-col items-center gap-4 py-4">
          <VerdictBadge verdict={analysis.verdict} />
          <p className="text-sm text-slate-300 text-center max-w-lg leading-relaxed">
            {analysis.verdict_summary}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              AI Confidence:
            </span>
            <span
              className={`text-[11px] font-bold uppercase tracking-wider ${
                analysis.overall_confidence === 'high'
                  ? 'text-emerald-400'
                  : analysis.overall_confidence === 'medium'
                  ? 'text-amber-400'
                  : 'text-red-400'
              }`}
            >
              {analysis.overall_confidence}
            </span>
          </div>
        </div>

        {/* Arguments */}
        <div>
          <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
            <Scale size={16} className="text-emerald-400" />
            Dispute Arguments ({analysis.arguments.length})
          </h3>
          <div className="space-y-3">
            {analysis.arguments.map((arg, i) => (
              <ArgumentCard key={i} arg={arg} index={i} />
            ))}
          </div>
        </div>

        {/* Recommended actions */}
        {analysis.recommended_actions && analysis.recommended_actions.length > 0 && (
          <div className="rounded-xl border border-slate-700/80 bg-slate-900/50 p-5">
            <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
              <ArrowRight size={16} className="text-blue-400" />
              Recommended Actions
            </h3>
            <ol className="space-y-2 pl-4">
              {analysis.recommended_actions.map((action, i) => (
                <li
                  key={i}
                  className="text-sm text-slate-300 list-decimal leading-relaxed"
                >
                  {action}
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Disclaimer */}
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-200/80 leading-relaxed">
              {analysis.disclaimer}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => generateDisputePDF(analysis, treatmentName)}
            className="pl-btn pl-btn-primary pl-btn-sm"
          >
            <Download size={15} />
            Download Dispute Report (PDF)
          </button>
          <button
            onClick={handleReset}
            className="pl-btn pl-btn-ghost pl-btn-sm"
          >
            Analyze Another Rejection
          </button>
        </div>
      </div>
    )
  }

  // ─── Form view ─────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center gap-2 rounded-full bg-red-500/15 border border-red-500/30 px-4 py-1.5">
          <Shield size={14} className="text-red-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-red-300">
            Claim Dispute Generator
          </span>
        </div>
        <h2 className="text-lg font-bold text-white font-['Sora']">
          Fight Back Against Unfair Rejections
        </h2>
        <p className="text-sm text-slate-400 max-w-md mx-auto">
          Enter the reason(s) your insurance company gave for rejecting your claim. We&apos;ll
          analyze your policy and build an evidence-backed dispute report.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-700/80 bg-slate-900/40 p-6 space-y-5">
        {/* Treatment & amount */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Treatment / Procedure
            </label>
            <input
              type="text"
              value={treatmentName}
              onChange={(e) => setTreatmentName(e.target.value)}
              placeholder="e.g., Knee Replacement Surgery"
              className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-colors"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Claim Amount
            </label>
            <input
              type="text"
              value={claimAmount}
              onChange={(e) => setClaimAmount(e.target.value)}
              placeholder="e.g., ₹3,50,000"
              className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-colors"
            />
          </div>
        </div>

        {/* Rejection reasons */}
        <div className="space-y-2">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Rejection Reason(s) <span className="text-red-400">*</span>
          </label>
          <div className="space-y-2">
            {reasons.map((reason, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-800 text-[11px] font-bold text-slate-400">
                  {i + 1}
                </div>
                <input
                  ref={(el) => { inputRefs.current[i] = el }}
                  type="text"
                  value={reason}
                  onChange={(e) => updateReason(i, e.target.value)}
                  placeholder={
                    i === 0
                      ? 'e.g., Pre-existing disease not disclosed'
                      : 'Add another rejection reason...'
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && reason.trim()) addReason()
                  }}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-colors"
                />
                {reasons.length > 1 && (
                  <button
                    onClick={() => removeReason(i)}
                    className="shrink-0 rounded-md p-1.5 text-slate-500 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={addReason}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-emerald-400 transition-colors mt-1"
          >
            <Plus size={13} />
            Add another reason
          </button>
        </div>

        {/* Rejection letter text (optional) */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Rejection Letter Text <span className="text-slate-600">(Optional)</span>
          </label>
          <textarea
            value={rejectionLetterText}
            onChange={(e) => setRejectionLetterText(e.target.value)}
            placeholder="Paste the full text from your rejection letter here for more accurate analysis..."
            rows={4}
            className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-colors resize-none"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <AlertTriangle size={14} className="shrink-0" />
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading || reasons.every((r) => !r.trim())}
          className="pl-btn pl-btn-primary w-full justify-center"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Analyzing rejection against policy...
            </>
          ) : (
            <>
              <Sparkles size={15} />
              Generate Dispute Report
            </>
          )}
        </button>
      </div>
    </div>
  )
}
