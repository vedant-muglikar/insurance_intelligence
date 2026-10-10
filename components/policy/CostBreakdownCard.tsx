'use client'

import type { CostBreakdown } from '@/lib/types/estimate'
import { formatINR } from '@/lib/policy/normalizers'

// One flat colour per part of the bill, taken from the theme.
const COLORS = ['var(--brand)', 'var(--ok)', 'var(--warn)', 'var(--info-ink)', 'var(--plum)', 'var(--deny)', 'var(--ok-ink)', 'var(--faint)']

/** How the typical bill splits into parts: a stacked bar, then each part with its amount, share and reason. */
export function CostBreakdownCard({ breakdown }: { breakdown: CostBreakdown }) {
  return (
    <section className="db-card cb" aria-label="Where the bill goes">
      <div className="db-card-head">
        <div>
          <h2 className="db-card-title">Where the bill goes</h2>
          <p className="db-card-sub">The typical bill of {formatINR(breakdown.total)}, split into parts.</p>
        </div>
      </div>

      <div className="cb-bar" role="img" aria-label={breakdown.rows.map((r) => `${r.label} ${r.sharePct} percent`).join(', ')}>
        {breakdown.rows.map((r, i) => (
          <i key={r.key} style={{ flexGrow: r.amount, background: COLORS[i % COLORS.length] }} />
        ))}
      </div>

      <ul className="cb-rows">
        {breakdown.rows.map((r, i) => (
          <li key={r.key}>
            <span className="cb-swatch" style={{ background: COLORS[i % COLORS.length] }} aria-hidden />
            <div className="cb-what">
              <strong>{r.label}</strong>
              <span>{r.why}</span>
            </div>
            <div className="cb-amt">
              <b>{formatINR(r.amount)}</b>
              <small>{r.sharePct}%</small>
            </div>
          </li>
        ))}
      </ul>

      <p className="cb-note">{breakdown.note}</p>
    </section>
  )
}
