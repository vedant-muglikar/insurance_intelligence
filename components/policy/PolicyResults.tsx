'use client'

import type { PolicyAnalysisResult, PolicyCategory, PolicyRule } from '@/lib/types/policy'
import { useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  FileSearch,
  Search,
  ShieldCheck,
  Sparkles,
  Clock3,
  Filter,
  ChevronRight,
} from 'lucide-react'
import { RuleCard, EvidenceViewer, StatusBadge } from './shared'
import { PolicyQA } from './PolicyQA'
import { EstimateForm } from './EstimateForm'
import GooeyNav from '../ui/GooeyNav'

// ─── Tab types ────────────────────────────────────────────────────────────────

type Tab =
  | 'Overview'
  | 'Preflight Estimator'
  | 'Coverage'
  | 'Exclusions'
  | 'Waiting Periods'
  | 'Limits'
  | 'Eligibility'
  | 'Claim Requirements'
  | 'Ask Policy'

const TABS: Tab[] = [
  'Overview',
  'Preflight Estimator',
  'Coverage',
  'Exclusions',
  'Waiting Periods',
  'Limits',
  'Eligibility',
  'Claim Requirements',
  'Ask Policy',
]

const TAB_CATEGORIES: Record<Tab, PolicyCategory[]> = {
  Overview: [],
  'Preflight Estimator': [],
  Coverage: ['coverage'],
  Exclusions: ['exclusion'],
  'Waiting Periods': ['waiting_period'],
  Limits: ['room_rent', 'icu_limit', 'sub_limit', 'deductible', 'co_payment'],
  Eligibility: ['eligibility'],
  'Claim Requirements': ['claim_requirement'],
  'Ask Policy': [],
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({
  result,
  setTab,
  onEvidence,
}: {
  result: PolicyAnalysisResult
  setTab: (t: Tab) => void
  onEvidence: (rule: PolicyRule) => void
}) {
  const { overview, extraction_stats, rules } = result
  const topRules = rules.slice(0, 4)

  const summaryItems = [
    { label: 'Insurer', value: overview.insurer || '—' },
    { label: 'Plan', value: overview.plan_name || '—' },
    { label: 'Sum Insured', value: overview.sum_insured || '—' },
    { label: 'Policy Type', value: overview.policy_type || '—' },
    { label: 'Total Pages', value: `${result.total_pages}` },
  ]

  const statCards = [
    {
      label: 'Coverage rules',
      value: extraction_stats.coverage_count,
      icon: ShieldCheck,
      tone: 'green',
    },
    {
      label: 'Exclusions',
      value: extraction_stats.exclusion_count,
      icon: AlertTriangle,
      tone: 'amber',
    },
    {
      label: 'Waiting periods',
      value: extraction_stats.waiting_period_count,
      icon: Clock3,
      tone: 'blue',
    },
    {
      label: 'Limits',
      value: extraction_stats.limit_count,
      icon: BarChart3,
      tone: 'purple',
    },
  ]

  return (
    <div className="tab-content">
      {/* Scanned PDF warning */}
      {result.scanned_pdf_warning && (
        <div className="scanned-warning">
          <AlertTriangle size={16} className="shrink-0 text-amber-400" />
          <div>
            <div className="font-medium text-amber-200">Scanned PDF detected</div>
            <p className="mt-0.5 text-xs text-slate-400">
              This document appears to be a scanned image. Text extraction may be
              incomplete. Consider using a text-based PDF for best results.
            </p>
          </div>
        </div>
      )}

      {/* Policy summary strip */}
      <div className="overview-summary">
        {summaryItems.map((item) => (
          <div key={item.label} className="overview-summary-item">
            <div className="overview-summary-label">{item.label}</div>
            <div className="overview-summary-value">{item.value}</div>
          </div>
        ))}
      </div>

      {/* Hero Preflight Callout Banner (Blueprint Section 1) */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-cyan-950/30 border border-emerald-500/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              ClaimLens Core Preflight
            </span>
            <span className="text-xs text-slate-400">· Pre-admission intelligence</span>
          </div>
          <h3 className="text-sm font-semibold text-white">
            Evaluate Hospital Treatment Scenario with Clause-to-Rupee Traceability
          </h3>
          <p className="text-xs text-slate-400">
            Check waiting periods, room eligibility, exclusions, sub-limits, and get an evidence-audited OOP estimate before hospital admission.
          </p>
        </div>

        <button
          onClick={() => setTab('Preflight Estimator')}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-4 py-2.5 rounded-lg flex items-center gap-1.5 transition-colors shrink-0 shadow-lg shadow-emerald-950"
        >
          <span>Launch Preflight</span>
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Stat cards */}
      <div className="overview-stats">
        {statCards.map((s) => {
          const Icon = s.icon
          return (
            <button
              key={s.label}
              className="overview-stat-card"
              onClick={() => setTab(s.label === 'Coverage rules' ? 'Coverage' : s.label === 'Exclusions' ? 'Exclusions' : s.label === 'Waiting periods' ? 'Waiting Periods' : 'Limits')}
            >
              <div className={`icon-box tone-${s.tone}`}>
                <Icon size={15} />
              </div>
              <div className="overview-stat-value">{s.value}</div>
              <div className="overview-stat-label">{s.label}</div>
              <ChevronRight size={13} className="ml-auto text-slate-600" />
            </button>
          )
        })}
      </div>

      {/* Recent rules */}
      <div className="overview-recent">
        <div className="section-header">
          <div>
            <h2 className="section-title">Key rules extracted</h2>
            <p className="section-sub">A sample from your policy analysis</p>
          </div>
          <button
            className="text-xs font-medium text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
            onClick={() => setTab('Coverage')}
          >
            View all <ChevronRight size={13} />
          </button>
        </div>
        <div className="rules-list">
          {topRules.map((rule, i) => (
            <RuleCard key={rule.id} rule={rule} onEvidence={onEvidence} index={i} />
          ))}
        </div>
      </div>

      {/* AI extraction stats */}
      <div className="ai-summary-card">
        <div className="flex items-center gap-3">
          <div className="icon-box tone-purple">
            <Sparkles size={15} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">
              AI Extraction Summary
            </h3>
            <p className="text-xs text-slate-500">
              Structured from {result.total_pages} pages · processed in{' '}
              {(result.processing_time_ms / 1000).toFixed(1)}s
            </p>
          </div>
        </div>
        <div className="ai-summary-grid">
          {[
            ['Total rules', extraction_stats.total_rules],
            ['Coverage', extraction_stats.coverage_count],
            ['Exclusions', extraction_stats.exclusion_count],
            ['Waiting periods', extraction_stats.waiting_period_count],
            ['Limits', extraction_stats.limit_count],
            ['Eligibility', extraction_stats.eligibility_count],
            ['Claim requirements', extraction_stats.claim_requirement_count],
            ['Validated evidence', extraction_stats.validated_count],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <div className="ai-summary-val">{value}</div>
              <div className="ai-summary-label">{label}</div>
            </div>
          ))}
        </div>
        <div className="ai-summary-note">
          AI extraction is an interpretation. Verify rules against the original
          policy wording before making decisions.
        </div>
      </div>
    </div>
  )
}

// ─── Rules tab (generic) ──────────────────────────────────────────────────────

function RulesTab({
  rules,
  tab,
  onEvidence,
}: {
  rules: PolicyRule[]
  tab: Tab
  onEvidence: (rule: PolicyRule) => void
}) {
  const [query, setQuery] = useState('')

  const filtered = rules.filter(
    (r) =>
      r.rule_name.toLowerCase().includes(query.toLowerCase()) ||
      r.description.toLowerCase().includes(query.toLowerCase()) ||
      r.value.toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <div className="tab-content">
      <div className="tab-toolbar">
        <div className="search-field">
          <Search size={14} />
          <input
            placeholder={`Search ${tab.toLowerCase()}...`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <span className="result-count">{filtered.length} rules</span>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <FileSearch size={28} className="text-slate-600" />
          <p>No {tab.toLowerCase()} found in this policy.</p>
        </div>
      ) : (
        <div className="rules-list">
          {filtered.map((rule, i) => (
            <RuleCard key={rule.id} rule={rule} onEvidence={onEvidence} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main results view ────────────────────────────────────────────────────────

interface PolicyResultsProps {
  result: PolicyAnalysisResult
  fileName: string
  onReset: () => void
}

export function PolicyResults({ result, fileName, onReset }: PolicyResultsProps) {
  const [tab, setTab] = useState<Tab>('Overview')
  const [activeRule, setActiveRule] = useState<PolicyRule | null>(null)

  const getRulesForTab = (t: Tab): PolicyRule[] => {
    const cats = TAB_CATEGORIES[t]
    if (!cats || cats.length === 0) return result.rules
    return result.rules.filter((r) => cats.includes(r.category))
  }

  const gooeyItems = TABS.map(t => {
    const count = t === 'Overview' || t === 'Ask Policy' || t === 'Preflight Estimator' ? null : getRulesForTab(t).length
    return {
      label: count !== null ? `${t} [${count}]` : (t === 'Ask Policy' ? '💬 Ask' : t === 'Preflight Estimator' ? '⚡ Preflight' : t)
    }
  })

  return (
    <div className="results-wrapper">
      {/* Top bar */}
      <div className="results-topbar">
        <button className="back-btn" onClick={onReset}>
          <ArrowLeft size={15} />
          New analysis
        </button>

        <div className="results-policy-info">
          <div className="results-policy-name">{result.overview.plan_name || fileName}</div>
          <div className="results-policy-meta">
            <span>{result.overview.insurer}</span>
            <span>·</span>
            <span>{result.total_pages} pages</span>
            <span>·</span>
            <StatusBadge status="covered" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="results-tabs-bar" style={{ padding: '10px 24px' }}>
        <div className="tabs-scroll" style={{ overflowX: 'auto', overflowY: 'hidden', paddingBottom: '4px' }}>
          <GooeyNav
            items={gooeyItems}
            initialActiveIndex={Math.max(0, TABS.indexOf(tab))}
            onChange={(idx) => setTab(TABS[idx])}
          />
        </div>
      </div>

      {/* Content */}
      <main className="results-main">
        {tab === 'Overview' ? (
          <OverviewTab
            result={result}
            setTab={setTab}
            onEvidence={setActiveRule}
          />
        ) : tab === 'Ask Policy' ? (
          <PolicyQA pages={result.pages} />
        ) : tab === 'Preflight Estimator' ? (
          <EstimateForm policyResult={result} />
        ) : (
          <RulesTab
            rules={getRulesForTab(tab)}
            tab={tab}
            onEvidence={setActiveRule}
          />
        )}
      </main>

      {/* Evidence viewer */}
      {activeRule && (
        <EvidenceViewer rule={activeRule} onClose={() => setActiveRule(null)} />
      )}
    </div>
  )
}
