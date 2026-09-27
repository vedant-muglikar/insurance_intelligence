'use client'

import type { PolicyRule, PolicyStatus, PolicyCategory } from '@/lib/types/policy'
import {
  FileSearch,
  ArrowRight,
  Info,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Copy,
  X,
} from 'lucide-react'
import { useState } from 'react'

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  PolicyStatus,
  { label: string; className: string; icon: React.ElementType }
> = {
  covered: {
    label: 'Covered',
    className: 'status-covered',
    icon: CheckCircle2,
  },
  conditionally_covered: {
    label: 'Conditional',
    className: 'status-conditional',
    icon: AlertTriangle,
  },
  not_covered: {
    label: 'Not Covered',
    className: 'status-not-covered',
    icon: XCircle,
  },
  unclear: {
    label: 'Unclear',
    className: 'status-unclear',
    icon: HelpCircle,
  },
}

export function StatusBadge({ status }: { status: PolicyStatus }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.unclear
  const Icon = config.icon
  return (
    <span className={`status-badge ${config.className}`}>
      <Icon size={10} />
      {config.label}
    </span>
  )
}

// ─── Confidence badge ─────────────────────────────────────────────────────────

export function ConfidenceBadge({
  confidence,
}: {
  confidence: 'high' | 'medium' | 'low'
}) {
  const map: Record<string, string> = {
    high: 'conf-high',
    medium: 'conf-medium',
    low: 'conf-low',
  }
  return (
    <span className={`conf-badge ${map[confidence]}`}>
      {confidence} confidence
    </span>
  )
}

// ─── Category label ───────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<PolicyCategory, string> = {
  coverage: 'Coverage',
  exclusion: 'Exclusion',
  waiting_period: 'Waiting Period',
  deductible: 'Deductible',
  co_payment: 'Co-payment',
  room_rent: 'Room Rent',
  icu_limit: 'ICU Limit',
  sub_limit: 'Sub-limit',
  eligibility: 'Eligibility',
  claim_requirement: 'Claim Requirement',
  sum_insured: 'Sum Insured',
  general: 'General',
}

// ─── Evidence Viewer panel ────────────────────────────────────────────────────

export function EvidenceViewer({
  rule,
  onClose,
}: {
  rule: PolicyRule
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(rule.evidence_text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Panel */}
      <aside className="evidence-panel">
        {/* Header */}
        <div className="evidence-header">
          <div>
            <div className="evidence-label">Policy Evidence</div>
            <h3 className="evidence-title">{rule.rule_name}</h3>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <X size={17} />
          </button>
        </div>

        {/* Body */}
        <div className="evidence-body">
          {/* Location pill */}
          <div className="evidence-location">
            <FileSearch size={14} className="text-emerald-400" />
            <span>
              {rule.page_number !== null
                ? `Page ${rule.page_number}`
                : 'Page unknown'}
            </span>
            {rule.section_name && (
              <>
                <span className="text-slate-700">·</span>
                <span>{rule.section_name}</span>
              </>
            )}
            {!rule.evidence_validated && (
              <span className="evidence-unverified">⚠ unverified</span>
            )}
          </div>

          {/* AI Interpretation block */}
          <div className="evidence-block ai-block">
            <div className="evidence-block-header">
              <Info size={13} />
              AI Interpretation
            </div>
            <div className="evidence-block-body">
              <div className="evidence-row">
                <span className="evidence-key">Category</span>
                <span className="evidence-val">
                  {CATEGORY_LABELS[rule.category]}
                </span>
              </div>
              <div className="evidence-row">
                <span className="evidence-key">Value</span>
                <span className="evidence-val font-medium">{rule.value}</span>
              </div>
              <div className="evidence-row">
                <span className="evidence-key">Status</span>
                <StatusBadge status={rule.status} />
              </div>
              <div className="evidence-row">
                <span className="evidence-key">Confidence</span>
                <ConfidenceBadge confidence={rule.confidence} />
              </div>
              {rule.conditions.length > 0 && (
                <div className="evidence-conditions">
                  <span className="evidence-key">Conditions</span>
                  <ul className="evidence-conditions-list">
                    {rule.conditions.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="evidence-description">{rule.description}</div>
            </div>
          </div>

          {/* Original Policy Evidence block */}
          <div className="evidence-block source-block">
            <div className="evidence-block-header">
              <FileSearch size={13} />
              Original Policy Evidence
              {rule.evidence_validated && (
                <span className="validated-chip">✓ verified on page</span>
              )}
            </div>
            <div className="evidence-block-body">
              {rule.evidence_text ? (
                <blockquote className="evidence-quote">
                  "{rule.evidence_text}"
                </blockquote>
              ) : (
                <p className="evidence-missing">
                  No direct text evidence was extracted for this rule.
                </p>
              )}
            </div>
          </div>

          {/* Warning if low confidence */}
          {rule.confidence === 'low' && (
            <div className="evidence-warning">
              <AlertTriangle size={14} className="shrink-0" />
              <p>
                This rule has low confidence. Evidence could not be fully
                verified against the referenced page. Please check the original
                document before relying on this information.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="evidence-footer">
          <button className="button-secondary flex-1" onClick={copy}>
            <Copy size={13} />
            {copied ? 'Copied!' : 'Copy evidence'}
          </button>
        </div>
      </aside>
    </>
  )
}

// ─── Rule card ────────────────────────────────────────────────────────────────

export function RuleCard({
  rule,
  onEvidence,
}: {
  rule: PolicyRule
  onEvidence: (rule: PolicyRule) => void
}) {
  return (
    <div className="rule-card">
      <div className="rule-card-top">
        <div className="rule-card-info">
          <h3 className="rule-card-name">{rule.rule_name}</h3>
          <p className="rule-card-desc">{rule.description}</p>
        </div>
        <StatusBadge status={rule.status} />
      </div>

      <div className="rule-card-meta">
        <div className="rule-meta-item">
          <span className="rule-meta-label">Value</span>
          <span className="rule-meta-val font-medium text-white">
            {rule.value}
          </span>
        </div>
        {rule.conditions.length > 0 && (
          <div className="rule-meta-item">
            <span className="rule-meta-label">Conditions</span>
            <span className="rule-meta-val">
              {rule.conditions.slice(0, 2).join('; ')}
              {rule.conditions.length > 2 && ' …'}
            </span>
          </div>
        )}
      </div>

      <div className="rule-card-footer">
        <ConfidenceBadge confidence={rule.confidence} />
        {!rule.evidence_validated && rule.page_number !== null && (
          <span className="unverified-tag">⚠ evidence unverified</span>
        )}
        <button
          className="source-link ml-auto"
          onClick={() => onEvidence(rule)}
        >
          <FileSearch size={12} />
          {rule.page_number !== null ? `Page ${rule.page_number}` : 'No page'}
          {rule.section_name ? ` · ${rule.section_name}` : ''}
          <ArrowRight size={11} />
        </button>
      </div>
    </div>
  )
}
