'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, List, X } from '@phosphor-icons/react'
import { Brand } from '@/components/ui/Brand'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { formatINR } from '@/lib/policy/normalizers'
import './landing-page.css'

const SECTIONS = [
  { id: 'how', label: 'How it works' },
  { id: 'try', label: 'Try a scenario' },
  { id: 'features', label: 'Features' },
  { id: 'costs', label: 'Cost model' },
] as const

/* ─────────────────────────── header ─────────────────────────── */

function Header() {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState('')

  // The current section comes from IntersectionObserver, never from scroll listeners.
  useEffect(() => {
    const visible = new Map<string, boolean>()
    const spy = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => visible.set(e.target.id, e.isIntersecting))
        const current = [...SECTIONS].reverse().find((s) => visible.get(s.id))
        setActive(current ? current.id : '')
      },
      { rootMargin: '-35% 0px -60% 0px' }
    )
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id)
      if (el) spy.observe(el)
    })
    return () => spy.disconnect()
  }, [])

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    window.addEventListener('hashchange', close)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('hashchange', close)
    }
  }, [open])

  return (
    <header className="lp-head">
      <div className="lp-head-inner">
        <Brand href="#top" label="BimaSetu, back to top" />

        <nav className="lp-links" aria-label="Page sections">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} aria-current={active === s.id ? 'true' : undefined}>
              {s.label}
            </a>
          ))}
        </nav>

        <div className="lp-head-actions">
          <ThemeToggle />
          <Link href="/login" className="lp-signin">
            Sign in
          </Link>
          <Link href="/app" className="lp-btn lp-btn-sm lp-launch">
            Launch Preflight
          </Link>
          <button
            type="button"
            className="lp-burger"
            aria-expanded={open}
            aria-controls="lp-mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X size={20} /> : <List size={20} />}
          </button>
        </div>
      </div>

      <nav id="lp-mobile-menu" className="lp-mobile" data-open={open} aria-label="Page sections (mobile)">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} onClick={() => setOpen(false)} tabIndex={open ? 0 : -1}>
            {s.label}
          </a>
        ))}
        <Link href="/login" tabIndex={open ? 0 : -1}>
          Sign in
        </Link>
        <Link href="/app" tabIndex={open ? 0 : -1} className="lp-btn lp-mobile-cta">
          Launch Preflight
        </Link>
      </nav>
    </header>
  )
}

/* ─────────────────────────── hero ─────────────────────────── */

/** A footbridge at first light. Flat shapes in the theme's own colours, so it follows light and dark. */
function BridgeArt() {
  return (
    <svg className="lp-art" viewBox="0 0 520 380" role="img" aria-label="A small footbridge over still water at sunrise" focusable="false">
      <rect className="art-sky" x="0" y="0" width="520" height="250" rx="22" />
      <circle className="art-sun" cx="352" cy="148" r="46" />
      <path className="art-hill art-hill-far" d="M0 232 C70 176 130 190 196 214 C262 166 330 176 400 214 C452 190 492 196 520 214 V250 H0 Z" />
      <path className="art-hill art-hill-near" d="M0 250 C60 218 118 224 176 240 C250 210 320 218 380 244 C440 226 490 232 520 246 V250 H0 Z" />
      <rect className="art-water" x="0" y="250" width="520" height="130" rx="0" />
      <path className="art-water-line" d="M70 292 H190 M250 312 H400 M120 336 H260 M320 350 H450" />
      <path className="art-arch" d="M64 252 C120 150 400 150 456 252" />
      <path className="art-deck" d="M44 252 H476" />
      <path className="art-post" d="M118 252 V206 M168 252 V176 M220 252 V162 M300 252 V162 M352 252 V176 M402 252 V206" />
      <path className="art-reflect" d="M64 256 C120 358 400 358 456 256" />
      <path className="art-leaf" d="M420 92 c14 -10 30 -8 38 4 c-14 10 -30 8 -38 -4 Z M72 120 c-10 -14 -8 -30 4 -38 c10 14 8 30 -4 38 Z" />
    </svg>
  )
}

function Hero() {
  return (
    <section className="lp-hero" id="top">
      <div className="lp-wrap lp-hero-grid">
        <div className="lp-hero-copy">
          <h1 className="lp-h1">Policy-to-Patient. Coverage Preflight.</h1>
          <p className="lp-lede">
            Before planned hospitalization, BimaSetu converts your insurance policy into auditable rules, applies them
            to patient scenarios in deterministic code, and explains your out-of-pocket patient share with
            Clause-to-Rupee traceability.
          </p>
          <div className="lp-actions">
            <Link href="/app" className="lp-btn">
              Launch Preflight <ArrowRight size={18} weight="bold" />
            </Link>
            <a href="#try" className="lp-link-quiet">
              Try a sample scenario
            </a>
          </div>
        </div>
        <div className="lp-hero-art">
          <BridgeArt />
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────── how it works ─────────────────────────── */

const STEPS = [
  {
    title: 'Upload your policy',
    desc: 'Drop any PDF: health, family floater, group policy. Up to 100 MB.',
  },
  {
    title: 'AI reads every clause',
    desc: 'Every coverage rule, exclusion, limit, waiting period and claim condition is extracted with the exact page and section it came from.',
  },
  {
    title: 'Ask, estimate, understand',
    desc: 'Chat with your policy, run treatment cost scenarios and see the covered versus out-of-pocket split instantly.',
  },
]

function HowItWorks() {
  return (
    <section className="lp-section" id="how">
      <div className="lp-wrap">
        <h2 className="lp-h2">From PDF to clarity in three steps</h2>
        <ol className="lp-steps">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="lp-step-no">{i + 1}</span>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

/* ─────────────────────────── what-if playground ─────────────────────────── */

const ROOMS = [
  { id: 'general', label: 'General ward', perDay: 2500 },
  { id: 'twin', label: 'Twin sharing', perDay: 4000 },
  { id: 'single', label: 'Single private', perDay: 7500 },
  { id: 'suite', label: 'Deluxe suite', perDay: 14000 },
] as const

type RoomId = (typeof ROOMS)[number]['id']

const STAY_DAYS = 4
const NON_ROOM_CHARGES = 350000
const ROOM_CAP_PER_DAY = 6000
const SENIOR_COPAY = 0.2

function runScenario(room: RoomId, senior: boolean, newPolicy: boolean) {
  const perDay = ROOMS.find((r) => r.id === room)!.perDay
  const bill = NON_ROOM_CHARGES + perDay * STAY_DAYS
  const roomExcess = Math.max(0, perDay - ROOM_CAP_PER_DAY) * STAY_DAYS
  const admissible = bill - roomExcess
  const copay = senior ? Math.round(admissible * SENIOR_COPAY) : 0
  const insurer = newPolicy ? 0 : admissible - copay
  const lines: { label: string; clause: string; amount: number }[] = []
  if (roomExcess > 0)
    lines.push({
      label: 'Room rent above the cap',
      clause: `Cap ₹6,000/day. This room is ${formatINR(perDay)}/day for ${STAY_DAYS} days.`,
      amount: roomExcess,
    })
  if (copay > 0)
    lines.push({
      label: 'Senior citizen co-payment',
      clause: `20% co-pay for patients aged 60+, on ${formatINR(admissible)}.`,
      amount: copay,
    })
  if (newPolicy)
    lines.push({
      label: 'Waiting period not complete',
      clause: 'Knee replacement is covered after 24 months. This policy is 10 months old.',
      amount: admissible - copay,
    })
  return { bill, insurer, patient: bill - insurer, lines }
}

function Playground() {
  const [room, setRoom] = useState<RoomId>('single')
  const [senior, setSenior] = useState(false)
  const [newPolicy, setNewPolicy] = useState(false)
  const r = useMemo(() => runScenario(room, senior, newPolicy), [room, senior, newPolicy])
  const pct = (r.insurer / r.bill) * 100

  const summary = newPolicy
    ? 'The policy has not completed its waiting period, so the insurer pays nothing for this surgery.'
    : r.lines.length === 0
      ? 'No clause reduces the payout. The insurer pays the full estimate.'
      : `${r.lines.length === 1 ? 'One clause reduces' : `${r.lines.length} clauses reduce`} the payout. You cover ${formatINR(r.patient)} of the ${formatINR(r.bill)} bill.`

  return (
    <section className="lp-section" id="try">
      <div className="lp-wrap">
        <h2 className="lp-h2">Change one thing. Watch the rupees move.</h2>
        <p className="lp-sub">
          A sample knee replacement on a sample policy. Flip the options and see which clause costs you, and how much.
        </p>

        <div className="lp-play">
          <form className="lp-play-controls" onSubmit={(e) => e.preventDefault()}>
            <fieldset>
              <legend>Room choice</legend>
              {ROOMS.map((o) => (
                <label key={o.id}>
                  <input type="radio" name="room" checked={room === o.id} onChange={() => setRoom(o.id)} />
                  {o.label}
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>Patient age</legend>
              <label>
                <input type="radio" name="age" checked={!senior} onChange={() => setSenior(false)} />
                Under 60
              </label>
              <label>
                <input type="radio" name="age" checked={senior} onChange={() => setSenior(true)} />
                60 or older
              </label>
            </fieldset>
            <fieldset>
              <legend>Policy age at admission</legend>
              <label>
                <input type="radio" name="policy" checked={!newPolicy} onChange={() => setNewPolicy(false)} />
                3 years
              </label>
              <label>
                <input type="radio" name="policy" checked={newPolicy} onChange={() => setNewPolicy(true)} />
                10 months
              </label>
            </fieldset>
          </form>

          <div className="lp-play-result" aria-live="polite">
            <p className="lp-k">You pay</p>
            <p className="lp-big">{formatINR(r.patient)}</p>

            <div className="lp-bar" role="img" aria-label={`Insurer pays ${formatINR(r.insurer)}, you pay ${formatINR(r.patient)}`}>
              <span style={{ width: `${pct}%` }} />
            </div>
            <dl className="lp-rows">
              <div>
                <dt>Bill</dt>
                <dd>{formatINR(r.bill)}</dd>
              </div>
              <div>
                <dt>Insurer pays</dt>
                <dd>{formatINR(r.insurer)}</dd>
              </div>
            </dl>

            <ul className="lp-ledger">
              {r.lines.length === 0 && <li className="lp-ledger-empty">No deductions triggered</li>}
              {r.lines.map((l) => (
                <li key={l.label}>
                  <div>
                    <strong>{l.label}</strong>
                    <span>{l.clause}</span>
                  </div>
                  <b>-{formatINR(l.amount)}</b>
                </li>
              ))}
            </ul>
            <p className="lp-summary">{summary}</p>
            <p className="lp-fine">Illustrative sample policy. Not real figures.</p>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────── features ─────────────────────────── */

const FEATURES = [
  {
    title: 'Clause-to-Rupee Traceability',
    desc: 'Every deduction, co-pay or room cap is traced from the bill back to verified policy wording, with the rupee amount.',
  },
  {
    title: 'Deterministic Coverage Engine',
    desc: 'No hallucinated arithmetic. Coverage rules, waiting-period date maths, room proration and sub-limits run in auditable TypeScript.',
  },
  {
    title: 'Hospital Bill Audit Engine',
    desc: 'Upload actual hospital bills to verify line-item arithmetic, flag duplicate charges, unbundled fees, and room-rent linked inflation.',
  },
  {
    title: 'Claim Dispute & Counter-Denial',
    desc: 'Generate formal dispute packets with legal citations, clause cross-references, and step-by-step resolution checklists.',
  },
  {
    title: 'What-If Scenario Simulator',
    desc: 'Test a different room, a later admission date or an age co-pay threshold, with live side-by-side deltas.',
  },
  {
    title: 'Missing Information Engine',
    desc: 'BimaSetu refuses false-confident answers. It spots missing start dates or declarations and asks for exactly what it needs.',
  },
  {
    title: 'Hospital Estimate First',
    desc: 'Upload the hospital’s estimate PDF or enter its line items. Benchmark tariffs stay a transparent fallback.',
  },
  {
    title: 'Timeline & Pre-Auth Readiness',
    desc: 'Waiting-period milestones, plus an evidence-backed checklist of forms and doctor notes before admission.',
  },
]

function Features() {
  return (
    <section className="lp-section" id="features">
      <div className="lp-wrap">
        <h2 className="lp-h2">Everything you need for pre-admission certainty</h2>
        <ul className="lp-features">
          {FEATURES.map((f) => (
            <li key={f.title}>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/* ─────────────────────────── cost model ─────────────────────────── */

const COST = { p10: 343733, p50: 404080, p90: 460554 }
const COST_ITEMS = [
  { label: 'Room & nursing', v: 48750 },
  { label: 'Surgery & OT', v: 191201 },
  { label: 'Doctor fees', v: 30067 },
  { label: 'Medicines & implants', v: 105134 },
  { label: 'Consumables', v: 28928 },
] as const
const COST_DRIVERS = [
  'Metro city raises the estimate by about 20%',
  'Single private room raises it by about 5%',
  'A 4-day stay raises it by about 4%',
]

function CostModel() {
  const lo = 280000
  const hi = 520000
  const pos = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`
  const total = COST_ITEMS.reduce((a, x) => a + x.v, 0)

  return (
    <section className="lp-section" id="costs">
      <div className="lp-wrap lp-costs">
        <div>
          <h2 className="lp-h2">A cost range from a model, not a flat guess</h2>
          <p className="lp-sub">
            Treatment costs come from a quantile model that reads the procedure, city, hospital tier, room, age and
            length of stay. You get a likely range and the factors behind it, so the surprise on discharge day is
            smaller.
          </p>
          <p className="lp-sub">Estimates are a starting point. A real hospital quote always replaces them.</p>
        </div>

        <div className="lp-cost">
          <p className="lp-cost-title">Total Knee Replacement</p>
          <p className="lp-cost-meta">Mumbai, private hospital, single room, 4 days, age 58. Sample.</p>

          <div className="lp-range" role="img" aria-label={`Likely range ${formatINR(COST.p10)} to ${formatINR(COST.p90)}, typical ${formatINR(COST.p50)}`}>
            <div className="lp-range-track">
              <span className="lp-range-band" style={{ left: pos(COST.p10), width: `calc(${pos(COST.p90)} - ${pos(COST.p10)})` }} />
              <span className="lp-range-mid" style={{ left: pos(COST.p50) }} />
            </div>
            <div className="lp-range-labels">
              <span>
                <small>Low</small>
                {formatINR(COST.p10)}
              </span>
              <span>
                <small>Typical</small>
                {formatINR(COST.p50)}
              </span>
              <span>
                <small>High</small>
                {formatINR(COST.p90)}
              </span>
            </div>
          </div>

          <dl className="lp-rows">
            {COST_ITEMS.map((x) => (
              <div key={x.label}>
                <dt>{x.label}</dt>
                <dd>{formatINR(x.v)}</dd>
              </div>
            ))}
            <div className="lp-rows-total">
              <dt>Line items total</dt>
              <dd>{formatINR(total)}</dd>
            </div>
          </dl>

          <ul className="lp-drivers">
            {COST_DRIVERS.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────── cta + footer ─────────────────────────── */

function Cta() {
  return (
    <section className="lp-cta">
      <div className="lp-wrap">
        <h2 className="lp-h2">Stop guessing. Know your patient share.</h2>
        <p className="lp-sub">Upload your policy and quotation now and get an auditable preflight.</p>
        <div className="lp-actions">
          <Link href="/app" className="lp-btn">
            Launch Preflight <ArrowRight size={18} weight="bold" />
          </Link>
          <Link href="/login" className="lp-link-quiet">
            Sign in
          </Link>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="lp-footer">
      <div className="lp-wrap lp-footer-grid">
        <div>
          <Brand href="#top" label="BimaSetu, back to top" />
          <p className="lp-footer-note">
            BimaSetu is an auditable pre-admission coverage preflight and estimation tool. It does not constitute
            insurer authorization, claim settlement, or legal advice.
          </p>
        </div>
        <nav aria-label="Footer">
          <h3>On this page</h3>
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`}>
              {s.label}
            </a>
          ))}
        </nav>
        <nav aria-label="Get started">
          <h3>Get started</h3>
          <Link href="/app">Launch Preflight</Link>
          <Link href="/login">Sign in</Link>
        </nav>
      </div>
    </footer>
  )
}

/* ─────────────────────────── page ─────────────────────────── */

export default function LandingPage() {
  return (
    <div className="lp">
      <a href="#how" className="lp-skip">
        Skip to content
      </a>
      <Header />
      <main>
        <Hero />
        <HowItWorks />
        <Playground />
        <Features />
        <CostModel />
        <Cta />
      </main>
      <Footer />
    </div>
  )
}
