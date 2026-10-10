'use client'

import React, { useState, useCallback, useRef, useMemo } from 'react'
import type { HospitalBill, HospitalBillLineItem, BillLineCategory } from '@/lib/types/bill'
import type { PolicyRule } from '@/lib/types/policy'
import type {
  BillAuditResult,
  AuditFinding,
  AuditLineVerdict,
  FindingDomain,
} from '@/lib/types/audit'
import { runBillAudit } from '@/lib/bill/auditor'
import { formatINR } from '@/lib/policy/normalizers'
import {
  Upload,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Pencil,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Info,
  Building2,
  Calendar,
  User,
  Hash,
  Stethoscope,
  Receipt,
  Loader2,
  FileScan,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  AlertCircle,
  Copy,
  CheckCheck,
  ArrowDown,
  Check,
  Layers,
  FileSpreadsheet,
} from 'lucide-react'
import { SAMPLE_HOSPITAL_BILLS } from '@/lib/bill/sampleBills'

// ─── Props ───────────────────────────────────────────────────────────────────

export interface BillAuditProps {
  policyRules?: PolicyRule[]
  policyName?: string
}

// ─── Category config ─────────────────────────────────────────────────────────

const CATEGORY_OPTIONS: { value: BillLineCategory; label: string }[] = [
  { value: 'room', label: 'Room / Bed / Nursing' },
  { value: 'icu', label: 'ICU / CCU / HDU' },
  { value: 'surgery', label: 'Surgery / OT / Procedure' },
  { value: 'doctor', label: 'Doctor / Surgeon / Consultant' },
  { value: 'implant', label: 'Implant / Prosthesis / Device' },
  { value: 'medicines', label: 'Medicines / Pharmacy / IV' },
  { value: 'diagnostics', label: 'Diagnostics / Tests / Imaging' },
  { value: 'consumables', label: 'Consumables / Disposables' },
  { value: 'ambulance', label: 'Ambulance / Transport' },
  { value: 'other', label: 'Other / Admin / Misc' },
]

// ─── Small helpers ───────────────────────────────────────────────────────────

function ConfidencePip({ c }: { c: 'high' | 'medium' | 'low' }) {
  const map = { high: 'var(--ok)', medium: 'var(--warn)', low: 'var(--deny)' }
  return (
    <span
      title={`Extraction confidence: ${c}`}
      style={{
        display: 'inline-block',
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: map[c],
        flexShrink: 0,
      }}
    />
  )
}

function EditedBadge() {
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '.06em',
        textTransform: 'uppercase',
        background: 'color-mix(in srgb, var(--info) 14%, transparent)',
        color: 'var(--info)',
        border: '1px solid color-mix(in srgb, var(--info) 30%, transparent)',
        borderRadius: 4,
        padding: '1px 5px',
      }}
    >
      edited
    </span>
  )
}

// ─── Empty / upload state ─────────────────────────────────────────────────────

function BillUploadPrompt({
  onFile,
  onLoadSample,
  isLoading,
  error,
}: {
  onFile: (f: File) => void
  onLoadSample?: (sample: HospitalBill, name: string) => void
  isLoading: boolean
  error: string | null
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const f = e.dataTransfer.files?.[0]
      if (f) onFile(f)
    },
    [onFile]
  )

  return (
    <div className="ba-upload-root">
      <div
        className={`ba-dropzone${isLoading ? ' ba-dropzone--loading' : ''}`}
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => !isLoading && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) onFile(f)
          }}
          disabled={isLoading}
        />

        {isLoading ? (
          <div className="ba-dropzone-inner">
            <Loader2 className="ba-upload-icon ba-spin" size={32} />
            <p className="ba-dropzone-title">Reading bill…</p>
            <p className="ba-dropzone-sub">Extracting line items and amounts</p>
          </div>
        ) : (
          <div className="ba-dropzone-inner">
            <Upload className="ba-upload-icon" size={32} />
            <p className="ba-dropzone-title">Upload hospital bill PDF</p>
            <p className="ba-dropzone-sub">
              Discharge summary, final itemised bill, or interim bill (PDF up to
              10MB)
            </p>
            <span className="ba-upload-btn">
              <FileScan size={14} /> Browse file
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="ba-alert ba-alert--error">
          <AlertTriangle size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Instant sample bills for testing */}
      {onLoadSample && !isLoading && (
        <div className="ba-sample-section">
          <span className="ba-sample-label">
            Or test instantly with sample hospital bills:
          </span>
          <div className="ba-sample-chips">
            {SAMPLE_HOSPITAL_BILLS.map(s => (
              <button
                key={s.id}
                type="button"
                className="ba-sample-btn"
                onClick={() => onLoadSample(s.bill, s.name)}
              >
                <Sparkles size={11} style={{ color: 'var(--ok)' }} />
                <span>{s.name}</span>
                <span style={{ color: 'var(--subtle)', fontSize: 10 }}>
                  ({s.total})
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="ba-upload-note">
        <Info size={13} className="shrink-0" />
        <span>
          Your bill is processed in-memory to extract line items. No medical
          records are permanently stored. Original PDF text is preserved for your
          review.
        </span>
      </div>
    </div>
  )
}

// ─── Header metadata strip ───────────────────────────────────────────────────

function BillHeaderStrip({ bill }: { bill: HospitalBill }) {
  const items = [
    { icon: Building2, label: 'Hospital', value: bill.hospitalName },
    { icon: User, label: 'Patient', value: bill.patientName },
    { icon: Hash, label: 'Bill No.', value: bill.billNumber },
    { icon: Calendar, label: 'Date', value: bill.billDate },
    { icon: Stethoscope, label: 'Diagnosis', value: bill.diagnosis },
  ].filter(i => i.value)

  if (items.length === 0) return null

  return (
    <div className="ba-header-strip">
      {items.map(({ icon: Icon, label, value }) => (
        <div key={label} className="ba-header-item">
          <Icon size={12} style={{ color: 'var(--muted)', flexShrink: 0 }} />
          <span className="ba-header-label">{label}</span>
          <span className="ba-header-value">{value}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Warnings panel ───────────────────────────────────────────────────────────

function WarningsPanel({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null
  return (
    <div className="ba-warnings">
      {warnings.map((w, i) => (
        <div key={i} className="ba-alert ba-alert--warn">
          <AlertTriangle size={13} className="shrink-0" />
          <span>{w}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Payment summary panel ────────────────────────────────────────────────────

function PaymentSummaryPanel({
  bill,
  calculatedSum,
}: {
  bill: HospitalBill
  calculatedSum: number
}) {
  const [open, setOpen] = useState(false)
  const ps = bill.paymentSummary
  const showDiscrepancy = Math.abs(calculatedSum - bill.totalBilledAmount) > 100

  return (
    <div className="ba-summary-panel">
      <div className="ba-summary-top">
        <div className="ba-summary-card">
          <div className="ba-summary-card-label">Billed Total</div>
          <div className="ba-summary-card-value">
            {formatINR(bill.totalBilledAmount)}
          </div>
        </div>
        <div className="ba-summary-card">
          <div className="ba-summary-card-label">Line Item Sum</div>
          <div
            className="ba-summary-card-value"
            style={{ color: showDiscrepancy ? 'var(--warn)' : 'inherit' }}
          >
            {formatINR(calculatedSum)}
          </div>
        </div>
        {ps?.netPayable != null && (
          <div className="ba-summary-card">
            <div className="ba-summary-card-label">Net Payable</div>
            <div className="ba-summary-card-value" style={{ color: 'var(--ok)' }}>
              {formatINR(ps.netPayable)}
            </div>
          </div>
        )}
        {ps?.balanceDue != null && (
          <div className="ba-summary-card">
            <div className="ba-summary-card-label">Balance Due</div>
            <div className="ba-summary-card-value" style={{ color: 'var(--deny)' }}>
              {formatINR(ps.balanceDue)}
            </div>
          </div>
        )}

        {ps && (
          <button
            className="ba-summary-expand"
            onClick={() => setOpen(o => !o)}
          >
            Payment breakdown{' '}
            {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        )}
      </div>

      {open && ps && (
        <div className="ba-payment-breakdown">
          {([
            ['Subtotal (before discount)', ps.subtotal],
            ['Hospital discount / waiver', ps.discount, true],
            ['Net payable', ps.netPayable],
            ['Advance / deposit paid', ps.deposit, true],
            ['Total amount paid', ps.amountPaid, true],
            ['Balance due', ps.balanceDue],
          ] as [string, number | undefined, boolean?][])
            .filter(([, v]) => v != null)
            .map(([label, value, isMinus]) => (
              <div key={label} className="ba-payment-row">
                <span className="ba-payment-label">{label}</span>
                <span
                  className="ba-payment-value"
                  style={isMinus ? { color: 'var(--ok)' } : undefined}
                >
                  {isMinus ? '−' : ''}{formatINR(value!)}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

// ─── PHASE 2: Audit Summary Metrics ──────────────────────────────────────────

function AuditSummaryMetrics({
  auditResult,
  bill,
  policyName,
}: {
  auditResult: BillAuditResult
  bill: HospitalBill
  policyName?: string
}) {
  const lineSum = auditResult.lineItemSum
  const statedTotal = auditResult.totalBill
  const hasTotalDiff = Math.abs(lineSum - statedTotal) > 100
  const diffAmt = Math.abs(lineSum - statedTotal)

  // Calculate total identified at-risk amount
  const atRiskAmount = auditResult.findings.reduce((sum, f) => {
    return sum + (f.calculatedDiscrepancy || 0)
  }, 0)

  return (
    <div className="ba-audit-dashboard">
      {/* Policy verification context strip */}
      <div className="ba-policy-context-bar">
        {auditResult.policyLoaded ? (
          <div className="ba-policy-badge ba-policy-badge--active">
            <ShieldCheck size={16} />
            <span>
              Policy Verified:{' '}
              <strong style={{ color: 'var(--info)' }}>
                {policyName || 'Uploaded Health Policy'}
              </strong>{' '}
              · Cross-checked against policy exclusions, sub-limits & room rent rules
            </span>
          </div>
        ) : (
          <div className="ba-policy-badge ba-policy-badge--none">
            <ShieldAlert size={16} />
            <span>
              Pure Hospital Billing Audit (Track A) · No policy loaded. Upload a
              policy in ClaimLens to enable Track B (Coverage & exclusion check).
            </span>
          </div>
        )}
        <span style={{ fontSize: 11, color: 'var(--subtle)' }}>
          Audited at {new Date(auditResult.auditTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* 4 Key Metric Cards */}
      <div className="ba-metric-grid">
        {/* Card 1: Stated vs Itemized */}
        <div
          className={`ba-metric-card ${
            hasTotalDiff ? 'ba-metric-card--warning' : 'ba-metric-card--success'
          }`}
        >
          <div className="ba-metric-label">
            <span>Bill Total vs Items</span>
            {hasTotalDiff ? (
              <AlertTriangle size={13} style={{ color: 'var(--warn)' }} />
            ) : (
              <CheckCircle2 size={13} style={{ color: 'var(--ok)' }} />
            )}
          </div>
          <div className="ba-metric-value">{formatINR(lineSum)}</div>
          <div className="ba-metric-sub">
            {hasTotalDiff ? (
              <span style={{ color: 'var(--warn)' }}>
                ₹{diffAmt.toLocaleString('en-IN')} mismatch with stated ₹{statedTotal.toLocaleString('en-IN')}
              </span>
            ) : (
              <span style={{ color: 'var(--ok)' }}>
                Matches stated total (₹{statedTotal.toLocaleString('en-IN')})
              </span>
            )}
          </div>
        </div>

        {/* Card 2: Hospital Billing Flags */}
        <div
          className={`ba-metric-card ${
            auditResult.billingFindingCount > 0
              ? 'ba-metric-card--warning'
              : 'ba-metric-card--success'
          }`}
        >
          <div className="ba-metric-label">
            <span>Hospital Billing Track</span>
            <Receipt size={13} style={{ color: 'var(--warn)' }} />
          </div>
          <div className="ba-metric-value" style={{ color: 'var(--warn)' }}>
            {auditResult.billingFindingCount}{' '}
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted)' }}>
              {auditResult.billingFindingCount === 1 ? 'finding' : 'findings'}
            </span>
          </div>
          <div className="ba-metric-sub">
            Duplicates, math discrepancies & vague charges
          </div>
        </div>

        {/* Card 3: Insurance Coverage Flags */}
        <div
          className={`ba-metric-card ${
            auditResult.insuranceFindingCount > 0
              ? 'ba-metric-card--alert'
              : 'ba-metric-card--success'
          }`}
        >
          <div className="ba-metric-label">
            <span>Insurance Policy Track</span>
            <ShieldCheck size={13} style={{ color: 'var(--plum)' }} />
          </div>
          <div className="ba-metric-value" style={{ color: 'var(--plum)' }}>
            {auditResult.insuranceFindingCount}{' '}
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted)' }}>
              {auditResult.insuranceFindingCount === 1 ? 'flag' : 'flags'}
            </span>
          </div>
          <div className="ba-metric-sub">
            {auditResult.policyLoaded
              ? 'Exclusions, sub-limits & proration risks'
              : 'Requires policy upload to cross-verify'}
          </div>
        </div>

        {/* Card 4: Identified At-Risk Exposure */}
        <div className="ba-metric-card ba-metric-card--alert">
          <div className="ba-metric-label">
            <span>Flagged / At-Risk Amount</span>
            <AlertCircle size={13} style={{ color: 'var(--deny)' }} />
          </div>
          <div className="ba-metric-value" style={{ color: 'var(--deny)' }}>
            {formatINR(atRiskAmount)}
          </div>
          <div className="ba-metric-sub">
            Identified non-payable items & billing discrepancies
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── PHASE 2: Interactive Audit Findings Panel ────────────────────────────────

function AuditFindingsPanel({
  findings,
  onLocateItem,
}: {
  findings: AuditFinding[]
  onLocateItem: (itemId: string) => void
}) {
  const [trackFilter, setTrackFilter] = useState<'all' | 'billing' | 'insurance'>('all')
  const [sevFilter, setSevFilter] = useState<'all' | 'high' | 'medium' | 'info'>('all')

  const billingCount = findings.filter(f => f.domain === 'billing').length
  const insuranceCount = findings.filter(f => f.domain === 'insurance').length

  const filteredFindings = useMemo(() => {
    return findings.filter(f => {
      if (trackFilter !== 'all' && f.domain !== trackFilter) return false
      if (sevFilter !== 'all' && f.severity !== sevFilter) return false
      return true
    })
  }, [findings, trackFilter, sevFilter])

  return (
    <div className="ba-findings-panel">
      {/* Header & filters */}
      <div className="ba-findings-header">
        <h3 className="ba-findings-title">
          <Layers size={18} style={{ color: 'var(--brand)' }} />
          Audit Findings & Charge Discrepancies ({findings.length})
        </h3>
      </div>

      <div className="ba-filters-wrap">
        {/* Track Filter Tabs */}
        <div className="ba-track-tabs">
          <button
            type="button"
            className={`ba-track-btn ${trackFilter === 'all' ? 'ba-track-btn--active' : ''}`}
            onClick={() => setTrackFilter('all')}
          >
            All Findings ({findings.length})
          </button>
          <button
            type="button"
            className={`ba-track-btn ${
              trackFilter === 'billing' ? 'ba-track-btn--active-billing' : ''
            }`}
            onClick={() => setTrackFilter('billing')}
          >
            🏥 Hospital Billing ({billingCount})
          </button>
          <button
            type="button"
            className={`ba-track-btn ${
              trackFilter === 'insurance' ? 'ba-track-btn--active-insurance' : ''
            }`}
            onClick={() => setTrackFilter('insurance')}
          >
            🛡️ Insurance Coverage ({insuranceCount})
          </button>
        </div>

        {/* Severity Filters */}
        <div className="ba-severity-filters">
          <span style={{ fontSize: 11, color: 'var(--subtle)', marginRight: 4 }}>
            Severity:
          </span>
          {(['all', 'high', 'medium', 'info'] as const).map(sev => (
            <button
              key={sev}
              type="button"
              className={`ba-sev-btn ${sevFilter === sev ? 'ba-sev-btn--active' : ''}`}
              onClick={() => setSevFilter(sev)}
            >
              {sev === 'all'
                ? 'All'
                : sev === 'high'
                ? 'High'
                : sev === 'medium'
                ? 'Medium'
                : 'Info'}
            </button>
          ))}
        </div>
      </div>

      {/* Findings List */}
      <div className="ba-findings-list">
        {filteredFindings.length === 0 ? (
          <div className="ba-empty-findings">
            <CheckCircle2 size={24} style={{ color: 'var(--ok)', margin: '0 auto 8px' }} />
            <p style={{ margin: 0, fontWeight: 600 }}>No findings match the selected filter.</p>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--subtle)' }}>
              All examined line items in this view passed the deterministic audit checks.
            </p>
          </div>
        ) : (
          filteredFindings.map(f => (
            <div
              key={f.id}
              className={`ba-finding-card ba-finding-card--${f.severity}`}
            >
              {/* Head */}
              <div className="ba-finding-head">
                <div className="ba-finding-badges">
                  {/* Domain badge */}
                  <span
                    className={`ba-badge ${
                      f.domain === 'billing' ? 'ba-badge--billing' : 'ba-badge--insurance'
                    }`}
                  >
                    {f.domain === 'billing' ? 'Hospital Billing' : 'Insurance Policy'}
                  </span>

                  {/* Severity badge */}
                  <span className={`ba-badge ba-badge--${f.severity}`}>
                    {f.severity}
                  </span>

                  {/* Specific issue label */}
                  {f.billingIssue && (
                    <span className="ba-badge" style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                      {f.billingIssue.replace(/_/g, ' ')}
                    </span>
                  )}
                  {f.insuranceIssue && (
                    <span className="ba-badge" style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                      {f.insuranceIssue.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>

                {f.calculatedDiscrepancy != null && f.calculatedDiscrepancy > 0 && (
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: 'var(--deny)',
                      fontFamily: 'var(--font-mono)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    ₹{f.calculatedDiscrepancy.toLocaleString('en-IN')} flagged
                  </span>
                )}
              </div>

              {/* Title & Explanation */}
              <h4 className="ba-finding-title">{f.title}</h4>
              <p className="ba-finding-explanation">{f.explanation}</p>

              {/* Verifiable Bill Evidence */}
              {(f.discrepancyFormula || f.billEvidence) && (
                <div className="ba-evidence-callout">
                  <div className="ba-evidence-label">Verifiable Bill Evidence</div>
                  {f.discrepancyFormula ? (
                    <div className="ba-evidence-formula">{f.discrepancyFormula}</div>
                  ) : null}
                  {f.billEvidence && !f.discrepancyFormula ? (
                    <div className="ba-evidence-text">{f.billEvidence}</div>
                  ) : null}
                </div>
              )}

              {/* Policy Clause Citation (Insurance Track) */}
              {f.policyClause && (
                <div className="ba-policy-callout">
                  <div className="ba-policy-cite-header">
                    <span>
                      {f.policySection || 'Policy Clause'}
                      {f.policyPage != null ? ` · Page ${f.policyPage}` : ''}
                    </span>
                    <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                      Contract Citation
                    </span>
                  </div>
                  <blockquote className="ba-policy-quote">
                    &ldquo;{f.policyClause}&rdquo;
                  </blockquote>
                </div>
              )}

              {/* Action Callout */}
              <div className="ba-action-callout">
                <Sparkles size={14} style={{ color: 'var(--ok)', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <strong>Recommended Action:</strong> {f.suggestedAction}
                </div>
              </div>

              {/* Locate button if affected item exists */}
              {f.affectedItemIds.length > 0 && (
                <button
                  type="button"
                  className="ba-locate-btn"
                  onClick={() => onLocateItem(f.affectedItemIds[0])}
                >
                  <ArrowDown size={11} /> Locate item in table below
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ─── PHASE 2: Discharge Billing Dispute Checklist ─────────────────────────────

function DischargeChecklistPanel({ findings }: { findings: AuditFinding[] }) {
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)

  // Generate checklist items from findings
  const checklistItems = useMemo(() => {
    return findings
      .filter(f => f.severity === 'high' || f.severity === 'medium')
      .map(f => ({
        id: f.id,
        text: `${f.title}: ${f.suggestedAction}`,
        discrepancy: f.calculatedDiscrepancy,
      }))
  }, [findings])

  const toggleCheck = (id: string) => {
    setCheckedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleCopyChecklist = () => {
    if (checklistItems.length === 0) return
    const text = [
      '📋 HOSPITAL BILL AUDIT — DISCHARGE COUNTER DISPUTE CHECKLIST',
      'Generated by ClaimLens Bill Intelligence',
      '',
      ...checklistItems.map((item, idx) => `${idx + 1}. [ ] ${item.text}`),
      '',
      'Please present these items to the hospital billing desk and TPA coordinator before making final payment.',
    ].join('\n')

    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  if (checklistItems.length === 0) return null

  return (
    <div className="ba-checklist-panel">
      <div className="ba-checklist-header">
        <h3 className="ba-checklist-title">
          <FileSpreadsheet size={16} style={{ color: 'var(--ok)' }} />
          Discharge Counter Action Checklist ({checklistItems.length} points to clarify)
        </h3>
        <button
          type="button"
          className="ba-copy-checklist-btn"
          onClick={handleCopyChecklist}
        >
          {copied ? <CheckCheck size={13} style={{ color: 'var(--ok)' }} /> : <Copy size={13} />}
          <span>{copied ? 'Copied to clipboard!' : 'Copy Checklist'}</span>
        </button>
      </div>

      <div className="ba-checklist-items">
        {checklistItems.map(item => {
          const isDone = checkedIds.has(item.id)
          return (
            <div
              key={item.id}
              className={`ba-check-item ${isDone ? 'ba-check-item--done' : ''}`}
              onClick={() => toggleCheck(item.id)}
            >
              <input
                type="checkbox"
                checked={isDone}
                onChange={() => {}}
                style={{ cursor: 'pointer', marginTop: 2 }}
              />
              <span style={{ flex: 1 }}>{item.text}</span>
              {item.discrepancy != null && item.discrepancy > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#f87171',
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ₹{item.discrepancy.toLocaleString('en-IN')}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Line item table with Phase 2 Audit Verdicts ──────────────────────────────

function BillLineTable({
  items,
  verdictMap,
  highlightedItemId,
  onChange,
  onAdd,
  onDelete,
}: {
  items: HospitalBillLineItem[]
  verdictMap: Map<string, AuditLineVerdict>
  highlightedItemId: string | null
  onChange: (idx: number, field: keyof HospitalBillLineItem, value: any) => void
  onAdd: () => void
  onDelete: (idx: number) => void
}) {
  return (
    <div className="ba-table-wrap" id="line-items-table">
      <div className="ba-table-scroll">
        <table className="ba-table">
          <thead>
            <tr>
              <th className="ba-th" style={{ width: 28 }}></th>
              <th className="ba-th">Category</th>
              <th className="ba-th ba-th--desc">Description</th>
              <th className="ba-th ba-th--center">Audit Verdict</th>
              <th className="ba-th ba-th--right">Pg</th>
              <th className="ba-th ba-th--right">Qty</th>
              <th className="ba-th ba-th--right">Unit Rate</th>
              <th className="ba-th ba-th--right">Total</th>
              <th className="ba-th ba-th--center">Conf.</th>
              <th className="ba-th ba-th--center">Del.</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <BillLineRow
                key={item.id}
                item={item}
                idx={idx}
                verdict={verdictMap.get(item.id)}
                isHighlighted={highlightedItemId === item.id}
                onChange={onChange}
                onDelete={onDelete}
              />
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={10} className="ba-table-empty">
                  No line items yet. Upload a bill or add items manually.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="ba-table-footer">
        <button className="ba-add-btn" onClick={onAdd}>
          <Plus size={13} /> Add item
        </button>
        <div className="ba-table-sum">
          <span style={{ color: 'var(--muted)' }}>Line item sum:</span>
          <span className="ba-table-sum-value">
            {formatINR(items.reduce((a, i) => a + i.amount, 0))}
          </span>
        </div>
      </div>
    </div>
  )
}

function BillLineRow({
  item,
  idx,
  verdict,
  isHighlighted,
  onChange,
  onDelete,
}: {
  item: HospitalBillLineItem
  idx: number
  verdict?: AuditLineVerdict
  isHighlighted: boolean
  onChange: (idx: number, field: keyof HospitalBillLineItem, value: any) => void
  onDelete: (idx: number) => void
}) {
  const [showOriginal, setShowOriginal] = useState(false)
  const hasOriginal =
    item.isUserEdited &&
    item.originalText &&
    item.originalText !== item.description

  const handleChange = (field: keyof HospitalBillLineItem, value: any) => {
    onChange(idx, field, value)
  }

  return (
    <>
      <tr className={`ba-tr ${isHighlighted ? 'ba-tr--highlighted' : ''}`} id={`item-row-${item.id}`}>
        {/* Edited indicator */}
        <td className="ba-td" style={{ paddingLeft: 8 }}>
          {item.isUserEdited && (
            <button
              title="Show original extracted value"
              onClick={() => setShowOriginal(o => !o)}
              style={{
                color: '#60a5fa',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 2,
              }}
            >
              <Pencil size={11} />
            </button>
          )}
        </td>

        {/* Category */}
        <td className="ba-td">
          <select
            className="ba-select"
            value={item.category}
            onChange={e => handleChange('category', e.target.value)}
          >
            {CATEGORY_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </td>

        {/* Description */}
        <td className="ba-td ba-td--desc">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="text"
              className="ba-input ba-input--desc"
              value={item.description}
              onChange={e => handleChange('description', e.target.value)}
            />
            {item.isUserEdited && <EditedBadge />}
          </div>
        </td>

        {/* Phase 2 Audit Verdict Column */}
        <td className="ba-td ba-td--center">
          <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            {/* Billing verdict */}
            {verdict?.billingVerdict === 'discrepancy' && (
              <span className="ba-verdict-pill ba-verdict-pill--err" title="Arithmetic discrepancy found">
                Math Error
              </span>
            )}
            {verdict?.billingVerdict === 'verify' && (
              <span className="ba-verdict-pill ba-verdict-pill--warn" title="Flagged as vague or possible duplicate">
                Verify
              </span>
            )}
            {verdict?.billingVerdict === 'ok' && !verdict?.insuranceVerdict && (
              <span className="ba-verdict-pill ba-verdict-pill--ok">OK</span>
            )}

            {/* Insurance verdict */}
            {verdict?.insuranceVerdict === 'likely_excluded' && (
              <span className="ba-verdict-pill ba-verdict-pill--excluded" title="Category excluded by policy">
                Excluded
              </span>
            )}
            {verdict?.insuranceVerdict === 'sub_limit_applies' && (
              <span className="ba-verdict-pill ba-verdict-pill--cap" title="Subject to policy sub-limit">
                Sub-limit
              </span>
            )}
            {verdict?.insuranceVerdict === 'conditional' && (
              <span className="ba-verdict-pill ba-verdict-pill--warn" title="Conditional or proration risk">
                Conditional
              </span>
            )}
            {verdict?.insuranceVerdict === 'likely_covered' && (
              <span className="ba-verdict-pill ba-verdict-pill--covered" title="Covered under policy">
                Covered
              </span>
            )}
            {verdict?.insuranceVerdict === 'no_policy' && verdict.billingVerdict === 'ok' && (
              <span className="ba-verdict-pill ba-verdict-pill--neutral" title="No policy loaded">
                OK
              </span>
            )}
          </div>
        </td>

        {/* Source page */}
        <td className="ba-td ba-td--right">
          <span className="ba-page-pill">
            {item.sourcePage ?? '—'}
          </span>
        </td>

        {/* Quantity */}
        <td className="ba-td ba-td--right">
          <input
            type="number"
            min="1"
            step="0.5"
            className="ba-input ba-input--num ba-input--sm"
            value={item.quantity}
            onChange={e =>
              handleChange('quantity', parseFloat(e.target.value) || 1)
            }
          />
        </td>

        {/* Unit price */}
        <td className="ba-td ba-td--right">
          <input
            type="number"
            min="0"
            className="ba-input ba-input--num"
            value={item.unitPrice}
            onChange={e =>
              handleChange('unitPrice', parseFloat(e.target.value) || 0)
            }
          />
        </td>

        {/* Total */}
        <td className="ba-td ba-td--right ba-td--total">
          {formatINR(item.amount)}
        </td>

        {/* Confidence pip */}
        <td className="ba-td ba-td--center">
          <ConfidencePip c={item.confidence} />
        </td>

        {/* Delete */}
        <td className="ba-td ba-td--center">
          <button
            className="ba-del-btn"
            onClick={() => onDelete(idx)}
            title="Remove this line item"
          >
            <Trash2 size={12} />
          </button>
        </td>
      </tr>

      {/* Original text row */}
      {showOriginal && hasOriginal && (
        <tr className="ba-tr-original">
          <td colSpan={10}>
            <div className="ba-original-row">
              <span style={{ color: 'var(--muted)', fontSize: 11 }}>
                Original extracted text:
              </span>
              <code className="ba-original-text">{item.originalText}</code>
              {item.originalAmount != null &&
                item.originalAmount !== item.amount && (
                  <span style={{ color: 'var(--warn)', fontSize: 11 }}>
                    Original amount: {formatINR(item.originalAmount)}
                  </span>
                )}
              <button
                className="ba-restore-btn"
                onClick={() => {
                  if (item.originalText != null)
                    onChange(idx, 'description', item.originalText)
                  if (item.originalAmount != null) {
                    onChange(idx, 'amount', item.originalAmount)
                    onChange(idx, 'unitPrice', item.originalAmount)
                    onChange(idx, 'quantity', 1)
                  }
                  onChange(idx, 'isUserEdited', false)
                  setShowOriginal(false)
                }}
              >
                <RotateCcw size={11} /> Restore original
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Extraction legend ────────────────────────────────────────────────────────

function ExtractionLegend() {
  return (
    <div className="ba-legend">
      <span className="ba-legend-item">
        <ConfidencePip c="high" /> High confidence
      </span>
      <span className="ba-legend-item">
        <ConfidencePip c="medium" /> Medium
      </span>
      <span className="ba-legend-item">
        <ConfidencePip c="low" /> Low
      </span>
      <span className="ba-legend-item">
        <Pencil size={10} style={{ color: 'var(--info)' }} /> User edited
      </span>
    </div>
  )
}

// ─── Main BillAudit component ─────────────────────────────────────────────────

export function BillAudit({ policyRules, policyName }: BillAuditProps = {}) {
  const [bill, setBill] = useState<HospitalBill | null>(null)
  const [lineItems, setLineItems] = useState<HospitalBillLineItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null)

  // ── Upload handler ──────────────────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    setIsLoading(true)
    setUploadError(null)
    setFileName(file.name)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/bill/analyze', {
        method: 'POST',
        body: formData,
      })
      const json = await res.json()

      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to extract hospital bill')
      }

      const parsed: HospitalBill = json.data
      setBill(parsed)
      setLineItems(parsed.lineItems)
    } catch (err: any) {
      setUploadError(err.message || 'Bill extraction failed. Please try again.')
      setFileName(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // ── Item editing ────────────────────────────────────────────────────────────

  const handleItemChange = useCallback(
    (idx: number, field: keyof HospitalBillLineItem, value: any) => {
      setLineItems(prev => {
        const updated = [...prev]
        const item = { ...updated[idx], [field]: value }

        // Recompute amount when qty or unit price changes
        if (field === 'quantity' || field === 'unitPrice') {
          const qty = Number(field === 'quantity' ? value : item.quantity) || 1
          const up = Number(field === 'unitPrice' ? value : item.unitPrice) || 0
          item.amount = qty * up
        }

        // Mark as user-edited when meaningful fields change
        if (
          field !== 'isUserEdited' &&
          field !== 'confidence' &&
          field !== 'sourcePage'
        ) {
          item.isUserEdited = true
        }

        updated[idx] = item
        return updated
      })
    },
    []
  )

  const handleAddItem = useCallback(() => {
    setLineItems(prev => [
      ...prev,
      {
        id: `item_manual_${Date.now()}`,
        description: 'New Charge Item',
        category: 'other' as BillLineCategory,
        quantity: 1,
        unitPrice: 0,
        amount: 0,
        confidence: 'high',
        isUserEdited: false,
      },
    ])
  }, [])

  const handleDeleteItem = useCallback((idx: number) => {
    setLineItems(prev => prev.filter((_, i) => i !== idx))
  }, [])

  const handleReset = useCallback(() => {
    setBill(null)
    setLineItems([])
    setUploadError(null)
    setFileName(null)
    setHighlightedItemId(null)
  }, [])

  const handleLoadSample = useCallback((sample: HospitalBill, name: string) => {
    setBill(sample)
    setLineItems(sample.lineItems)
    setFileName(name)
    setUploadError(null)
    setHighlightedItemId(null)
  }, [])

  // ── Run Phase 2 Audit Engine deterministically ──────────────────────────────

  const auditResult = useMemo<BillAuditResult | null>(() => {
    if (!bill || lineItems.length === 0) return null
    return runBillAudit(bill, lineItems, policyRules)
  }, [bill, lineItems, policyRules])

  // Build Map of itemId -> Verdict
  const verdictMap = useMemo(() => {
    const map = new Map<string, AuditLineVerdict>()
    if (auditResult) {
      for (const v of auditResult.verdicts) {
        map.set(v.itemId, v)
      }
    }
    return map
  }, [auditResult])

  // Scroll to and highlight item in table
  const handleLocateItem = useCallback((itemId: string) => {
    setHighlightedItemId(itemId)
    const el = document.getElementById(`item-row-${itemId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    setTimeout(() => {
      setHighlightedItemId(null)
    }, 4000)
  }, [])

  const calculatedSum = lineItems.reduce((a, i) => a + i.amount, 0)

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="tab-content ba-root">
      {/* Section header */}
      <div className="ba-section-header">
        <div className="icon-box tone-blue" style={{ width: 36, height: 36 }}>
          <Receipt size={16} />
        </div>
        <div>
          <h2 className="ba-section-title">Hospital Bill Verification & Audit</h2>
          <p className="ba-section-sub">
            Deterministic bill verification against arithmetic errors, duplicate charges, vague entries, and policy coverage rules.
            {bill && (
              <>
                {' '}
                <button className="ba-reset-link" onClick={handleReset}>
                  Upload a different bill ↗
                </button>
              </>
            )}
          </p>
        </div>

        {bill && fileName && (
          <div className="ba-file-pill">
            <FileText size={12} />
            <span>{fileName}</span>
            <span
              className="ba-parse-badge"
              style={{
                color:
                  bill.parsingConfidence === 'high'
                    ? 'var(--ok)'
                    : bill.parsingConfidence === 'medium'
                    ? 'var(--warn)'
                    : 'var(--deny)',
              }}
            >
              {bill.extractionMethod === 'ai' ? 'AI extracted' : 'Heuristic'} ·{' '}
              {bill.parsingConfidence} confidence
            </span>
          </div>
        )}
      </div>

      {/* Upload prompt */}
      {!bill && (
        <BillUploadPrompt
          onFile={handleFile}
          onLoadSample={handleLoadSample}
          isLoading={isLoading}
          error={uploadError}
        />
      )}

      {/* Bill extracted — show Phase 2 Audit Dashboard */}
      {bill && (
        <>
          {/* Bill header metadata */}
          <BillHeaderStrip bill={bill} />

          {/* Warnings from extraction */}
          <WarningsPanel warnings={bill.warnings} />

          {/* Phase 2: Audit Summary Metrics */}
          {auditResult && (
            <AuditSummaryMetrics
              auditResult={auditResult}
              bill={bill}
              policyName={policyName}
            />
          )}

          {/* Phase 2: Interactive Audit Findings Panel */}
          {auditResult && (
            <AuditFindingsPanel
              findings={auditResult.findings}
              onLocateItem={handleLocateItem}
            />
          )}

          {/* Phase 2: Discharge Dispute & Negotiation Checklist */}
          {auditResult && (
            <DischargeChecklistPanel findings={auditResult.findings} />
          )}

          {/* Payment summary */}
          <PaymentSummaryPanel bill={bill} calculatedSum={calculatedSum} />

          {/* Editable line item table with Audit Status column */}
          <div className="ba-table-section">
            <div className="ba-table-heading">
              <div>
                <h3 className="ba-table-title">
                  Itemised Hospital Charges ({lineItems.length} items)
                </h3>
                <p className="ba-table-sub">
                  Review extracted charges. Correct any items if needed — the audit engine re-calculates discrepancies in real-time.
                </p>
              </div>
              <ExtractionLegend />
            </div>

            <BillLineTable
              items={lineItems}
              verdictMap={verdictMap}
              highlightedItemId={highlightedItemId}
              onChange={handleItemChange}
              onAdd={handleAddItem}
              onDelete={handleDeleteItem}
            />
          </div>

          {/* Status footer bar */}
          <div className="ba-cta-bar">
            <div className="ba-cta-info">
              <CheckCircle2 size={14} style={{ color: 'var(--ok)' }} />
              <span>
                {lineItems.filter(i => !i.isUserEdited).length} items as extracted
                ·{' '}
                {lineItems.filter(i => i.isUserEdited).length} user-edited
                ·{' '}
                {auditResult?.findings.length || 0} audit findings identified
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="pl-btn pl-btn-primary pl-btn-sm ba-cta-btn"
                onClick={() => {
                  const el = document.getElementById('line-items-table')
                  if (el) el.scrollIntoView({ behavior: 'smooth' })
                }}
              >
                Review Itemised Table ↓
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
