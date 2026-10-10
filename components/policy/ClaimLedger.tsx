'use client'

import { useMemo, useRef, useState } from 'react'
import { CheckCircle, Download, FilePdf, Plus, Receipt, Warning } from '@phosphor-icons/react'
import { adjudicate, diffAdjudications } from '@/lib/claims/adjudicate'
import { SAMPLE_CLAIM_BILLS, SAMPLE_BASE_EFFECTIVE, sampleVersions } from '@/lib/claims/samples'
import { extractEffectiveDate, makeVersion } from '@/lib/claims/versions'
import type { AdjudicationResult, LedgerItem, PolicyVersion } from '@/lib/claims/types'
import { analyzePolicyUpload } from '@/lib/client/analyzePolicyUpload'
import { formatINR } from '@/lib/policy/normalizers'
import type { HospitalBill, HospitalBillLineItem } from '@/lib/types/bill'
import type { PolicyAnalysisResult } from '@/lib/types/policy'

interface Props {
  policy: PolicyAnalysisResult
  fileName: string
  /** A bill read in the chat, handed over for adjudication. */
  incomingBill?: HospitalBill | null
}

type Source = { id: string; title: string; bill: HospitalBill; items: HospitalBillLineItem[]; note?: string }

const STAGE_LABEL: Record<string, string> = {
  waiting_period: 'Waiting period',
  exclusion: 'Excluded',
  room_rent: 'Room rent',
  sub_limit: 'Sub-limit',
  deductible: 'Deductible',
  copay: 'Co-pay',
  sum_insured: 'Sum insured',
  review_hold: 'Held for review',
}

const STATUS_LABEL: Record<LedgerItem['status'], string> = {
  payable: 'Payable',
  reduced: 'Reduced',
  excluded: 'Not payable',
  review: 'Review',
}

function isSample(policy: PolicyAnalysisResult): boolean {
  return policy.overview.uin === 'HDFHLIP21175V012021'
}

export function ClaimLedger({ policy, fileName, incomingBill }: Props) {
  const sample = isSample(policy)
  const samples = useMemo(() => (sample ? sampleVersions() : null), [sample])

  // ── policy versions ────────────────────────────────────────────────────────
  const [baseDate, setBaseDate] = useState<string>(() => (sample ? SAMPLE_BASE_EFFECTIVE : extractEffectiveDate(policy.pages).date ?? ''))
  const base = useMemo<PolicyVersion>(
    () =>
      makeVersion({
        id: 'base',
        label: 'Base policy',
        documentName: fileName,
        result: policy,
        kind: 'base',
        effectiveFrom: baseDate || null,
        synthetic: sample,
      }),
    [policy, fileName, baseDate, sample],
  )
  const [amendments, setAmendments] = useState<PolicyVersion[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const amendRef = useRef<HTMLInputElement>(null)

  const versions = useMemo(() => [base, ...amendments], [base, amendments])

  const addSampleEndorsement = () => {
    if (!samples || amendments.some((a) => a.id === samples.amendment.id)) return
    setAmendments((a) => [...a, samples.amendment])
  }

  const onAmendmentFile = async (file: File) => {
    setUploading(true)
    setUploadError(null)
    try {
      const { promise } = analyzePolicyUpload(file, () => {})
      const res = await promise
      const n = amendments.length + 1
      setAmendments((a) => [
        ...a,
        makeVersion({ id: `amendment-${Date.now()}`, label: `Amendment ${n}`, documentName: file.name, result: res, kind: 'amendment' }),
      ])
    } catch (e: any) {
      setUploadError(e?.message || 'Could not read that document.')
    } finally {
      setUploading(false)
    }
  }

  const setAmendmentDate = (id: string, date: string) =>
    setAmendments((list) => list.map((a) => (a.id === id ? { ...a, effectiveFrom: date || null, effectiveFromEvidence: undefined } : a)))

  // ── the bill ───────────────────────────────────────────────────────────────
  const sources = useMemo<Source[]>(() => {
    const out: Source[] = []
    if (incomingBill) out.push({ id: 'chat', title: 'Bill from your chat', bill: incomingBill, items: incomingBill.lineItems })
    for (const c of SAMPLE_CLAIM_BILLS) out.push({ id: c.id, title: `Sample: ${c.title}`, bill: c.bill, items: c.bill.lineItems, note: c.shows })
    return out
  }, [incomingBill])
  const [uploaded, setUploaded] = useState<Source | null>(null)
  const [sourceId, setSourceId] = useState<string>(() => (incomingBill ? 'chat' : sample ? SAMPLE_CLAIM_BILLS[0].id : ''))
  const all = uploaded ? [uploaded, ...sources] : sources
  const source = all.find((s) => s.id === sourceId) ?? all[0] ?? null
  const [billError, setBillError] = useState<string | null>(null)
  const [billLoading, setBillLoading] = useState(false)
  const billRef = useRef<HTMLInputElement>(null)

  const onBillFile = async (file: File) => {
    setBillLoading(true)
    setBillError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/bill/analyze', { method: 'POST', body: fd })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Could not read that bill.')
      const bill: HospitalBill = json.data
      const s: Source = { id: 'upload', title: `Uploaded: ${file.name}`, bill, items: bill.lineItems }
      setUploaded(s)
      setSourceId('upload')
    } catch (e: any) {
      setBillError(e?.message || 'Could not read that bill.')
    } finally {
      setBillLoading(false)
    }
  }

  // ── inputs ─────────────────────────────────────────────────────────────────
  const sampleClaim = SAMPLE_CLAIM_BILLS.find((c) => c.id === source?.id)
  const [treatmentDate, setTreatmentDate] = useState<string>(() => sampleClaim?.treatmentDate ?? incomingBill?.admissionDate ?? '')
  const [age, setAge] = useState<string>(() => (sampleClaim ? String(sampleClaim.patientAge) : ''))
  const [policyStart, setPolicyStart] = useState<string>(() => sampleClaim?.policyStartDate ?? '')
  const [availableSI, setAvailableSI] = useState<string>(() => (policy.overview.sum_insured_amount ? String(policy.overview.sum_insured_amount) : ''))
  const [roomRate, setRoomRate] = useState<string>('')
  const [items, setItems] = useState<Record<string, number>>({})
  const [compare, setCompare] = useState(true)

  const pickSource = (id: string) => {
    setSourceId(id)
    setItems({})
    const c = SAMPLE_CLAIM_BILLS.find((x) => x.id === id)
    if (c) {
      setTreatmentDate(c.treatmentDate)
      setAge(String(c.patientAge))
      setPolicyStart(c.policyStartDate)
    } else {
      const s = all.find((x) => x.id === id)
      if (s?.bill.admissionDate) setTreatmentDate(s.bill.admissionDate)
    }
  }

  const liveItems = useMemo(
    () => (source?.items ?? []).map((i) => (items[i.id] !== undefined ? { ...i, amount: items[i.id], unitPrice: i.quantity > 1 ? Math.round(items[i.id] / i.quantity) : items[i.id] } : i)),
    [source, items],
  )

  const common = useMemo(
    () => ({
      items: liveItems,
      bill: source?.bill,
      treatmentDate: treatmentDate || null,
      patientAge: age ? Number(age) : null,
      policyStartDate: policyStart || null,
      availableSumInsured: availableSI ? Number(availableSI) : null,
      entitledRoomRatePerDay: roomRate ? Number(roomRate) : null,
    }),
    [liveItems, source, treatmentDate, age, policyStart, availableSI, roomRate],
  )

  const result: AdjudicationResult | null = useMemo(() => (source ? adjudicate({ ...common, versions }) : null), [source, common, versions])
  const baseOnly: AdjudicationResult | null = useMemo(() => (source && amendments.length ? adjudicate({ ...common, versions: [base] }) : null), [source, common, base, amendments.length])
  const diff = result && baseOnly && result.selection.inForce.length > 1 ? diffAdjudications(baseOnly, result) : null

  const download = () => {
    if (!result) return
    const blob = new Blob([JSON.stringify({ input: { treatmentDate, age, policyStart, availableSI, roomRate, bill: source?.title }, versions: versions.map((v) => ({ id: v.id, label: v.label, effectiveFrom: v.effectiveFrom, synthetic: v.synthetic })), result, baseOnly }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'claim-ledger-evidence.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="db-stack">
      {/* ── inputs ─────────────────────────────────────────── */}
      <section className="db-card">
        <div className="db-card-head">
          <div>
            <h2 className="db-card-title">1. The bill</h2>
            <p className="db-card-sub">Pick a bill, then set the treatment details. Change anything and the ledger recomputes.</p>
          </div>
          <button type="button" className="db-btn db-btn-ghost" onClick={() => billRef.current?.click()} disabled={billLoading}>
            <Receipt size={16} weight="bold" aria-hidden /> {billLoading ? 'Reading...' : 'Upload a bill'}
          </button>
          <input ref={billRef} type="file" hidden accept="application/pdf,image/*" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onBillFile(f) }} />
        </div>
        {billError && <p className="db-banner">{billError}</p>}

        <div className="cl-form">
          <label className="cl-field cl-wide">
            <span>Bill</span>
            <select value={source?.id ?? ''} onChange={(e) => pickSource(e.target.value)}>
              {all.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
          <label className="cl-field">
            <span>Treatment date</span>
            <input type="date" value={treatmentDate} onChange={(e) => setTreatmentDate(e.target.value)} />
          </label>
          <label className="cl-field">
            <span>Patient age</span>
            <input inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 64" />
          </label>
          <label className="cl-field">
            <span>Policy start date</span>
            <input type="date" value={policyStart} onChange={(e) => setPolicyStart(e.target.value)} />
          </label>
          <label className="cl-field">
            <span>Sum insured left (₹)</span>
            <input inputMode="numeric" value={availableSI} onChange={(e) => setAvailableSI(e.target.value.replace(/\D/g, ''))} />
          </label>
          <label className="cl-field">
            <span>Entitled room rate per day (₹)</span>
            <input inputMode="numeric" value={roomRate} onChange={(e) => setRoomRate(e.target.value.replace(/\D/g, ''))} placeholder="only if the policy names no amount" />
          </label>
        </div>
        {source?.note && <p className="db-fine">{source.note}</p>}
      </section>

      {/* ── versions ───────────────────────────────────────── */}
      <section className="db-card">
        <div className="db-card-head">
          <div>
            <h2 className="db-card-title">2. Policy documents</h2>
            <p className="db-card-sub">The documents in force on the treatment date are applied in order. A later amendment replaces an earlier rule on the same topic.</p>
          </div>
          <div className="cl-actions">
            {samples && (
              <button type="button" className="db-btn db-btn-ghost" onClick={addSampleEndorsement} disabled={amendments.some((a) => a.id === samples.amendment.id)}>
                <Plus size={16} weight="bold" aria-hidden /> Add sample endorsement
              </button>
            )}
            <button type="button" className="db-btn db-btn-ghost" onClick={() => amendRef.current?.click()} disabled={uploading}>
              <FilePdf size={16} weight="bold" aria-hidden /> {uploading ? 'Reading...' : 'Upload an amendment'}
            </button>
            <input ref={amendRef} type="file" hidden accept="application/pdf" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onAmendmentFile(f) }} />
          </div>
        </div>
        {uploadError && <p className="db-banner">{uploadError}</p>}

        <ul className="cl-versions">
          <li>
            <div>
              <strong>Base policy</strong>
              <span>{fileName}</span>
            </div>
            <label className="cl-date">
              <span>Effective from</span>
              <input type="date" value={baseDate} onChange={(e) => setBaseDate(e.target.value)} />
            </label>
            <VersionChip result={result} id="base" />
          </li>
          {amendments.map((a) => (
            <li key={a.id}>
              <div>
                <strong>{a.label}</strong>
                <span>{a.documentName}{a.synthetic ? ' (synthetic)' : ''}</span>
                {a.effectiveFromEvidence && <em>Read from page {a.effectiveFromEvidence.page}: &ldquo;{a.effectiveFromEvidence.quote.slice(0, 110)}...&rdquo;</em>}
              </div>
              <label className="cl-date">
                <span>Effective from</span>
                <input type="date" value={a.effectiveFrom ?? ''} onChange={(e) => setAmendmentDate(a.id, e.target.value)} />
              </label>
              <VersionChip result={result} id={a.id} />
            </li>
          ))}
        </ul>

        {result && result.selection.candidates.length > 0 && (
          <ul className="cl-reasons">
            {result.selection.candidates.map((c) => (
              <li key={c.id}>
                <b>{c.label}:</b> {c.reason}
              </li>
            ))}
          </ul>
        )}
        {result && result.selection.changes.length > 0 && (
          <div className="cl-changes">
            <h3>What the amendments changed</h3>
            <ul>
              {result.selection.changes.map((c, i) => (
                <li key={i}>
                  <span className="db-chip" data-tone={c.kind === 'added' ? 'ok' : 'info'}>{c.kind === 'added' ? 'Added' : 'Replaced'}</span>
                  <b>{c.ruleName}</b>
                  {c.previousSummary ? <span>: {c.previousSummary} becomes {c.newSummary}</span> : <span>: {c.newSummary}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ── ledger ─────────────────────────────────────────── */}
      {result && (
        <>
          <div className="db-kpis">
            <Kpi label="Claimed" value={formatINR(result.totals.claimed)} sub={`${result.items.length} bill items`} />
            <Kpi label="Payable" value={formatINR(result.totals.payable)} sub={`${pct(result.totals.payable, result.totals.claimed)}% of the claim`} tone="ok" />
            <Kpi label="You pay" value={formatINR(result.totals.patientPays)} sub="Everything not payable" />
            <Kpi label="Held for review" value={formatINR(result.totals.heldForReview)} sub="Included in what you pay until decided" tone={result.totals.heldForReview ? 'warn' : undefined} />
          </div>

          {!result.checks.ok && (
            <p className="db-banner">
              <Warning size={18} weight="bold" aria-hidden /> The ledger failed its own checks: {result.checks.messages[0]}
            </p>
          )}
          {result.warnings.length > 0 && (
            <section className="db-card cl-warn">
              <h3>Information needed</h3>
              <ul>
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="db-card">
            <div className="db-card-head">
              <div>
                <h2 className="db-card-title">3. Item ledger</h2>
                <p className="db-card-sub">Edit any amount to recompute. Each deduction is applied once, in a fixed order.</p>
              </div>
              <button type="button" className="db-btn db-btn-ghost" onClick={download}>
                <Download size={16} weight="bold" aria-hidden /> Download evidence
              </button>
            </div>

            <div className="cl-table" role="table" aria-label="Item ledger">
              <div className="cl-row cl-head" role="row">
                <span>Item</span>
                <span className="cl-num">Claimed</span>
                <span className="cl-num">Payable</span>
                <span>Deduction</span>
                <span>Clause</span>
              </div>
              {result.items.map((it) => (
                <LedgerRow key={it.id} it={it} onAmount={(v) => setItems((m) => ({ ...m, [it.id]: v }))} edited={items[it.id] !== undefined} />
              ))}
              <div className="cl-row cl-total" role="row">
                <span>Total</span>
                <span className="cl-num">{formatINR(result.totals.claimed)}</span>
                <span className="cl-num">{formatINR(result.totals.payable)}</span>
                <span>
                  {Object.entries(result.totals.byStage)
                    .map(([k, v]) => `${STAGE_LABEL[k] ?? k} ${formatINR(v as number)}`)
                    .join(', ') || 'None'}
                </span>
                <span />
              </div>
            </div>
          </section>

          {baseOnly && (
            <section className="db-card">
              <div className="db-card-head">
                <div>
                  <h2 className="db-card-title">4. Before and after the amendment</h2>
                  <p className="db-card-sub">The same bill under the base policy alone, and under the documents in force on the treatment date.</p>
                </div>
                <label className="cl-switch">
                  <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> Show items
                </label>
              </div>
              {diff ? (
                <p className="cl-diff">
                  Base policy alone pays <b>{formatINR(diff.payableBefore)}</b>. With the amendment in force it pays <b>{formatINR(diff.payableAfter)}</b>.{' '}
                  <b className={diff.change < 0 ? 'cl-neg' : 'cl-pos'}>{diff.change < 0 ? '-' : '+'}{formatINR(Math.abs(diff.change))}</b> across {diff.changedItems} items.
                </p>
              ) : (
                <p className="cl-diff">No amendment is in force on this treatment date, so both ledgers are the same.</p>
              )}
              {diff && compare && (
                <div className="cl-table" role="table" aria-label="Before and after">
                  <div className="cl-row cl-head cl-row-ba" role="row">
                    <span>Item</span>
                    <span className="cl-num">Base only</span>
                    <span className="cl-num">With amendment</span>
                    <span className="cl-num">Change</span>
                  </div>
                  {diff.rows.map((r) => (
                    <div key={r.id} className="cl-row cl-row-ba" role="row">
                      <span>{r.description}</span>
                      <span className="cl-num">{formatINR(r.payableBefore)}</span>
                      <span className="cl-num">{formatINR(r.payableAfter)}</span>
                      <span className={`cl-num ${r.change < 0 ? 'cl-neg' : r.change > 0 ? 'cl-pos' : ''}`}>{r.change === 0 ? '0' : `${r.change < 0 ? '-' : '+'}${formatINR(Math.abs(r.change))}`}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <section className="db-card">
            <h2 className="db-card-title">Calculation trace</h2>
            <p className="db-card-sub">Every step, in the order it ran. Matching used the {result.matcher} matcher.</p>
            <ol className="cl-trace">
              {result.trace.map((t, i) => (
                <li key={i}>
                  <div className="cl-trace-head">
                    <b>{t.title}</b>
                    {t.stage !== 'start' && t.stage !== 'version' && t.stage !== 'result' && (
                      <span className="cl-num">
                        {formatINR(t.totalBefore)} to {formatINR(t.totalAfter)}
                      </span>
                    )}
                  </div>
                  <p>{t.formula}</p>
                  {t.clause && (
                    <p className="cl-cite">
                      {t.clause.versionLabel}, page {t.clause.page ?? '?'}: &ldquo;{t.clause.quote.slice(0, 160)}&rdquo;
                    </p>
                  )}
                </li>
              ))}
            </ol>
            {result.checks.ok && (
              <p className="cl-ok">
                <CheckCircle size={16} weight="fill" aria-hidden /> Checks passed: every item's claimed amount equals its payable amount plus its deductions, and no step ran twice for any item.
              </p>
            )}
          </section>
        </>
      )}

      {!source && <p className="db-empty">Upload a hospital bill to build a ledger.</p>}
    </div>
  )
}

function pct(a: number, b: number) {
  return b > 0 ? Math.round((a / b) * 100) : 0
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className="db-kpi">
      <span className="db-kpi-label">{label}</span>
      <span className={`db-kpi-value db-kpi-money ${tone === 'ok' ? 'est-ok' : ''}`}>{value}</span>
      <span className="db-kpi-sub">{sub}</span>
    </div>
  )
}

function VersionChip({ result, id }: { result: AdjudicationResult | null; id: string }) {
  const c = result?.selection.candidates.find((x) => x.id === id)
  if (!c) return <span />
  return (
    <span className="db-chip" data-tone={c.inForce ? 'ok' : undefined}>
      {c.inForce ? 'In force' : 'Not applied'}
    </span>
  )
}

function LedgerRow({ it, onAmount, edited }: { it: LedgerItem; onAmount: (v: number) => void; edited: boolean }) {
  const totalDed = it.deductions.reduce((a, d) => a + d.amount, 0)
  const clauses = it.deductions.flatMap((d) => d.clauses)
  const uniq = clauses.filter((c, i) => clauses.findIndex((x) => x.ruleId === c.ruleId && x.versionId === c.versionId) === i)
  return (
    <details className="cl-item" data-status={it.status}>
      <summary className="cl-row" role="row">
        <span className="cl-desc">
          <b>{it.description}</b>
          <i className="cl-status" data-status={it.status}>{STATUS_LABEL[it.status]}</i>
        </span>
        <span className="cl-num" onClick={(e) => e.stopPropagation()}>
          <input
            className="cl-amt"
            aria-label={`Claimed amount for ${it.description}`}
            inputMode="numeric"
            defaultValue={it.claimed}
            key={`${it.id}-${it.claimed}`}
            onBlur={(e) => {
              const v = parseInt(e.target.value.replace(/\D/g, ''), 10)
              if (Number.isFinite(v) && v !== it.claimed) onAmount(v)
            }}
          />
          {edited && <small>edited</small>}
        </span>
        <span className="cl-num">{formatINR(it.payable)}</span>
        <span className="cl-ded">
          {it.deductions.length === 0 ? '-' : `${formatINR(totalDed)} ${it.deductions.map((d) => STAGE_LABEL[d.stage] ?? d.stage).join(', ')}`}
        </span>
        <span className="cl-clause">{uniq.length ? uniq.map((c) => `${c.ruleName} (${c.versionLabel}, p.${c.page ?? '?'})`).join('; ') : '-'}</span>
      </summary>
      <div className="cl-more">
        {it.deductions.map((d) => (
          <p key={d.stage}>
            <b>{STAGE_LABEL[d.stage] ?? d.stage}, {formatINR(d.amount)}:</b> {d.formula}
            {d.clauses.map((c) => (
              <em key={c.ruleId + c.versionId}>
                {c.versionLabel}, page {c.page ?? '?'}: &ldquo;{c.quote.slice(0, 200)}&rdquo;
              </em>
            ))}
          </p>
        ))}
        {it.review.map((r, i) => (
          <p key={i} className="cl-review">
            <Warning size={14} weight="bold" aria-hidden /> {r}
          </p>
        ))}
        {it.matches.length > 0 && (
          <p className="cl-matches">
            Matched clauses: {it.matches.map((m) => `${m.ruleName} (${m.role}, shared terms: ${m.terms.join(', ')})`).join('; ')}
          </p>
        )}
      </div>
    </details>
  )
}
