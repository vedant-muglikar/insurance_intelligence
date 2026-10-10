'use client'

import type { HospitalBill, HospitalBillLineItem, BillLineCategory } from '@/lib/types/bill'
import type { BillAuditResult } from '@/lib/types/audit'
import { formatINR } from '@/lib/policy/normalizers'
import { sortFindings } from '@/lib/bill/chatSummary'

export interface BillCheck {
  data: HospitalBill
  items: HospitalBillLineItem[]
  audit: BillAuditResult
}

const CATEGORIES: { value: BillLineCategory; label: string }[] = [
  { value: 'room', label: 'Room' },
  { value: 'icu', label: 'ICU' },
  { value: 'surgery', label: 'Surgery' },
  { value: 'doctor', label: 'Doctor' },
  { value: 'implant', label: 'Implant' },
  { value: 'medicines', label: 'Medicines' },
  { value: 'diagnostics', label: 'Tests' },
  { value: 'consumables', label: 'Consumables' },
  { value: 'ambulance', label: 'Ambulance' },
  { value: 'other', label: 'Other' },
]

/** The bill check shown inside a chat reply: the same extraction and deterministic audit as before, in a compact card. */
export function BillCheckCard({ check, onItemsChange, onAdjudicate }: { check: BillCheck; onItemsChange: (items: HospitalBillLineItem[]) => void; onAdjudicate?: () => void }) {
  const { data, items, audit } = check
  const findings = sortFindings(audit.findings)
  const total = data.totalBilledAmount || audit.lineItemSum
  const gap = Math.abs(audit.lineItemSum - data.totalBilledAmount)
  const showGap = data.totalBilledAmount > 0 && gap > 100

  const edit = (id: string, change: Partial<HospitalBillLineItem>) =>
    onItemsChange(
      items.map((i) => {
        if (i.id !== id) return i
        const next = { ...i, ...change, isUserEdited: true }
        if (change.amount !== undefined) next.unitPrice = next.quantity ? change.amount / next.quantity : change.amount
        return next
      }),
    )

  return (
    <div className="bc">
      <dl className="bc-stats">
        <div>
          <dt>Billed</dt>
          <dd>{formatINR(total)}</dd>
        </div>
        <div>
          <dt>Charges</dt>
          <dd>{items.length}</dd>
        </div>
        <div data-tone={findings.length ? 'warn' : 'ok'}>
          <dt>To check</dt>
          <dd>{findings.length}</dd>
        </div>
      </dl>

      {showGap && (
        <p className="bc-warn">
          Charges add up to {formatINR(audit.lineItemSum)} but the bill total says {formatINR(data.totalBilledAmount)}.
        </p>
      )}
      {data.warnings.slice(0, 3).map((w, i) => (
        <p key={i} className="bc-warn">
          {w}
        </p>
      ))}

      {findings.length > 0 && (
        <ul className="bc-findings">
          {findings.map((f) => (
            <li key={f.id}>
              <details>
                <summary>
                  <i className="bc-dot" data-sev={f.severity} aria-label={`${f.severity} priority`} />
                  <span className="bc-title">{f.title}</span>
                  <span className="bc-tag">{f.domain === 'insurance' ? 'Policy' : 'Bill'}</span>
                </summary>
                <div className="bc-body">
                  <p>{f.explanation}</p>
                  {f.discrepancyFormula && <p className="bc-mono">{f.discrepancyFormula}</p>}
                  {f.policyClause && (
                    <p className="bc-quote">
                      &ldquo;{f.policyClause}&rdquo;{f.policyPage ? ` (page ${f.policyPage})` : ''}
                    </p>
                  )}
                  <p className="bc-next">{f.suggestedAction}</p>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}

      <details className="bc-lines">
        <summary>Check the {items.length} charges</summary>
        <p className="bc-hint">Fix any amount that was misread. The checks re-run straight away.</p>
        <ul>
          {items.map((i) => (
            <li key={i.id} data-low={i.confidence === 'low' || undefined}>
              <span className="bc-desc">{i.description}</span>
              <select
                aria-label={`Category for ${i.description}`}
                value={i.category}
                onChange={(e) => edit(i.id, { category: e.target.value as BillLineCategory })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <input
                key={`${i.id}-${i.amount}`}
                aria-label={`Amount for ${i.description}`}
                inputMode="decimal"
                defaultValue={i.amount}
                onBlur={(e) => {
                  const v = parseFloat(e.target.value.replace(/,/g, ''))
                  if (Number.isFinite(v) && v >= 0 && v !== i.amount) edit(i.id, { amount: v })
                }}
              />
            </li>
          ))}
        </ul>
      </details>

      {onAdjudicate && (
        <button type="button" className="db-btn db-btn-primary bc-adj" onClick={onAdjudicate}>
          Open the claim ledger for this bill
        </button>
      )}

      <p className="bc-foot">Rule-based checks that point to what to verify. They never say a charge is fraud.</p>
    </div>
  )
}
