'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { animate, useInView } from 'motion/react'
import { ArrowRight, Bed, CalendarCheck, List, Scales, X } from '@phosphor-icons/react'
import PolicyPreview from '@/components/landing/PolicyPreview'
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

/* ─────────────────────────── nav ─────────────────────────── */

function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState('')
  const sentinel = useRef<HTMLDivElement>(null)

  // "Scrolled" and the current section come from IntersectionObserver, never from scroll listeners.
  useEffect(() => {
    const top = sentinel.current
    const topObs = new IntersectionObserver(([e]) => setScrolled(!e.isIntersecting), { threshold: 0 })
    if (top) topObs.observe(top)

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
    return () => {
      topObs.disconnect()
      spy.disconnect()
    }
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
    <>
      <div ref={sentinel} className="lp-sentinel" aria-hidden />
      <header className="lp-nav" data-scrolled={scrolled || open}>
        <div className="lp-progress" aria-hidden />
        <div className="lp-nav-inner">
          <Brand href="#top" label="BimaSetu, back to top" />

          <nav className="lp-links" aria-label="Page sections">
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="lp-link" aria-current={active === s.id ? 'true' : undefined}>
                {s.label}
              </a>
            ))}
          </nav>

          <div className="lp-nav-actions">
            <ThemeToggle />
            <Link href="/login" className="lp-signin">
              Sign in
            </Link>
            <Link href="/app" className="pl-btn pl-btn-primary pl-btn-sm lp-launch">
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
              {open ? <X size={20} weight="bold" /> : <List size={20} weight="bold" />}
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
        </nav>
      </header>
    </>
  )
}

/* ─────────────────────────── hero ─────────────────────────── */

function Hero() {
  return (
    <section className="lp-hero" id="top">
      <div className="lp-wrap lp-hero-grid">
        <div className="lp-hero-copy">
          <h1 className="lp-h1">
            Policy-to-Patient.
            <span className="lp-h1-accent">Coverage Preflight.</span>
          </h1>
          <p className="lp-lede">
            Before planned hospitalization, BimaSetu converts your insurance policy into auditable rules, applies them
            to patient scenarios in deterministic code, and explains your out-of-pocket patient share with
            Clause-to-Rupee traceability.
          </p>
          <div className="lp-actions">
            <Link href="/app" className="pl-btn pl-btn-primary">
              Launch Preflight <ArrowRight size={18} weight="bold" />
            </Link>
            <a href="#try" className="pl-btn pl-btn-ghost">
              Try a sample scenario
            </a>
          </div>
        </div>

        <div className="lp-hero-proof">
          <PolicyPreview />
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────── stats ─────────────────────────── */

/** Counts up by writing to the DOM node directly, so no React state changes per frame. */
function Stat({ value, suffix, label }: { value: number; suffix: string; label: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.6 })

  useEffect(() => {
    const el = ref.current
    if (!el || !inView) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const controls = animate(0, value, {
      duration: 1.2,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        el.textContent = String(Math.round(v))
      },
    })
    return () => controls.stop()
  }, [inView, value])

  return (
    <div className="lp-stat">
      <div className="lp-stat-num pl-num">
        <span ref={ref}>{value}</span>
        {suffix && <small>{suffix}</small>}
      </div>
      <div className="lp-stat-label">{label}</div>
    </div>
  )
}

function Stats() {
  return (
    <div className="lp-stats">
      <div className="lp-wrap lp-stats-grid">
        <Stat value={12} suffix="" label="policy clause categories extracted" />
        <Stat value={17} suffix="" label="procedures priced by the cost model" />
        <Stat value={60} suffix="s" label="average analysis time" />
      </div>
    </div>
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
      <div className="lp-wrap lp-split">
        <div className="lp-split-head">
          <h2 className="lp-h2">
            From PDF to clarity <span>in three steps</span>
          </h2>
        </div>
        <ol className="lp-steps">
          {STEPS.map((s) => (
            <li key={s.title} className="lp-step">
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

const BASELINE = runScenario('single', false, false)

function Playground() {
  const [room, setRoom] = useState<RoomId>('single')
  const [senior, setSenior] = useState(false)
  const [newPolicy, setNewPolicy] = useState(false)
  const r = useMemo(() => runScenario(room, senior, newPolicy), [room, senior, newPolicy])
  const delta = r.patient - BASELINE.patient
  const pct = (r.insurer / r.bill) * 100

  const summary = newPolicy
    ? 'The policy has not completed its waiting period, so the insurer pays nothing for this surgery.'
    : r.lines.length === 0
      ? 'No clause reduces the payout. The insurer pays the full estimate.'
      : `${r.lines.length === 1 ? 'One clause reduces' : `${r.lines.length} clauses reduce`} the payout. You cover ${formatINR(r.patient)} of the ${formatINR(r.bill)} bill.`

  return (
    <section className="lp-section lp-try" id="try">
      <div className="lp-wrap">
        <div className="lp-section-head">
          <h2 className="lp-h2">
            Change one thing. <span>Watch the rupees move.</span>
          </h2>
          <p className="lp-sub">
            A sample knee replacement on a sample policy. Flip the options and see which clause costs you, and how
            much.
          </p>
        </div>

        <div className="lp-play">
          <div className="lp-play-controls">
            <fieldset className="lp-fieldset">
              <legend>
                <Bed size={16} weight="bold" aria-hidden /> Room choice
              </legend>
              <div className="lp-opts">
                {ROOMS.map((o) => (
                  <label key={o.id} className="lp-opt">
                    <input type="radio" name="room" checked={room === o.id} onChange={() => setRoom(o.id)} />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="lp-fieldset">
              <legend>
                <Scales size={16} weight="bold" aria-hidden /> Patient age
              </legend>
              <div className="lp-opts">
                <label className="lp-opt">
                  <input type="radio" name="age" checked={!senior} onChange={() => setSenior(false)} />
                  <span>Under 60</span>
                </label>
                <label className="lp-opt">
                  <input type="radio" name="age" checked={senior} onChange={() => setSenior(true)} />
                  <span>60 or older</span>
                </label>
              </div>
            </fieldset>

            <fieldset className="lp-fieldset">
              <legend>
                <CalendarCheck size={16} weight="bold" aria-hidden /> Policy age at admission
              </legend>
              <div className="lp-opts">
                <label className="lp-opt">
                  <input type="radio" name="policy" checked={!newPolicy} onChange={() => setNewPolicy(false)} />
                  <span>3 years</span>
                </label>
                <label className="lp-opt">
                  <input type="radio" name="policy" checked={newPolicy} onChange={() => setNewPolicy(true)} />
                  <span>10 months</span>
                </label>
              </div>
            </fieldset>
          </div>

          <div className="lp-play-result" aria-live="polite">
            <div className="lp-play-top">
              <div>
                <span className="lp-k">You pay</span>
                <span className="lp-big lp-big-you pl-num">{formatINR(r.patient)}</span>
              </div>
              <div className="lp-delta" data-dir={delta === 0 ? 'none' : delta > 0 ? 'up' : 'down'}>
                {delta === 0
                  ? 'Starting scenario'
                  : `${delta > 0 ? '+' : '-'}${formatINR(Math.abs(delta))} vs starting scenario`}
              </div>
            </div>

            <div className="lp-split-bar" role="img" aria-label={`Insurer pays ${formatINR(r.insurer)}, you pay ${formatINR(r.patient)}`}>
              <span style={{ width: `${pct}%` }} />
            </div>
            <div className="lp-split-legend">
              <span>
                Insurer pays <b className="pl-num">{formatINR(r.insurer)}</b>
              </span>
              <span>
                Bill <b className="pl-num">{formatINR(r.bill)}</b>
              </span>
            </div>

            <ul className="lp-ledger">
              {r.lines.length === 0 && <li className="lp-ledger-empty">No deductions triggered</li>}
              {r.lines.map((l) => (
                <li key={l.label}>
                  <div>
                    <strong>{l.label}</strong>
                    <span>{l.clause}</span>
                  </div>
                  <b className="pl-num">-{formatINR(l.amount)}</b>
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
        <div className="lp-section-head">
          <h2 className="lp-h2">
            Everything you need for <span className="lp-nowrap">pre-admission</span> <span>certainty</span>
          </h2>
        </div>
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
  { label: 'Room & nursing', v: 48750, c: 'a' },
  { label: 'Surgery & OT', v: 191201, c: 'b' },
  { label: 'Doctor fees', v: 30067, c: 'c' },
  { label: 'Medicines & implants', v: 105134, c: 'd' },
  { label: 'Consumables', v: 28928, c: 'e' },
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
    <section className="lp-section lp-costs" id="costs">
      <div className="lp-wrap lp-costs-grid">
        <div>
          <h2 className="lp-h2">
            A cost range from a model, <span>not a flat guess</span>
          </h2>
          <p className="lp-sub">
            Treatment costs come from a quantile model that reads the procedure, city, hospital tier, room, age and
            length of stay. You get a likely range and the factors behind it, so the surprise on discharge day is
            smaller.
          </p>
          <p className="lp-sub">Estimates are a starting point. A real hospital quote always replaces them.</p>
        </div>

        <div className="lp-cost-card">
          <div className="lp-cost-title">Total Knee Replacement</div>
          <div className="lp-cost-meta">Mumbai, private hospital, single room, 4 days, age 58</div>

          <div className="lp-range" role="img" aria-label={`Likely range ${formatINR(COST.p10)} to ${formatINR(COST.p90)}, typical ${formatINR(COST.p50)}`}>
            <div className="lp-range-track">
              <span className="lp-range-band" style={{ left: pos(COST.p10), width: `calc(${pos(COST.p90)} - ${pos(COST.p10)})` }} />
              <span className="lp-range-mid" style={{ left: pos(COST.p50) }} />
            </div>
            <div className="lp-range-labels">
              <span>
                <small>Low</small>
                <b className="pl-num">{formatINR(COST.p10)}</b>
              </span>
              <span className="lp-range-typ">
                <small>Typical</small>
                <b className="pl-num">{formatINR(COST.p50)}</b>
              </span>
              <span>
                <small>High</small>
                <b className="pl-num">{formatINR(COST.p90)}</b>
              </span>
            </div>
          </div>

          <ul className="lp-legend">
            {COST_ITEMS.map((x) => (
              <li key={x.label}>
                <i data-c={x.c} className="lp-swatch" />
                <span>{x.label}</span>
                <b className="pl-num">{formatINR(x.v)}</b>
              </li>
            ))}
            <li className="lp-legend-total">
              <span>Line items total</span>
              <b className="pl-num">{formatINR(total)}</b>
            </li>
          </ul>

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
        <div className="lp-cta-card">
          <div>
            <h2>Stop guessing. Know your patient share.</h2>
            <p>Upload your policy and quotation now and get an auditable preflight in under 60 seconds.</p>
          </div>
          <div className="lp-cta-actions">
            <Link href="/app" className="pl-btn pl-btn-primary">
              Launch Preflight <ArrowRight size={18} weight="bold" />
            </Link>
            <Link href="/login" className="pl-btn pl-btn-ghost">
              Sign in
            </Link>
          </div>
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
      <Nav />
      <main>
        <Hero />
        <Stats />
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
