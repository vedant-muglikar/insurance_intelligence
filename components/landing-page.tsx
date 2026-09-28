'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

// ── Animated counter hook ─────────────────────────────────────────────────────
function useCounter(target: number, duration = 1800, start = false) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!start) return
    let frame = 0
    const totalFrames = Math.round((duration / 1000) * 60)
    const step = () => {
      frame++
      const progress = frame / totalFrames
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.min(Math.round(eased * target), target))
      if (frame < totalFrames) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [start, target, duration])
  return value
}

// ── Scroll observer hook ──────────────────────────────────────────────────────
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInView(true) }, { threshold })
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return { ref, inView }
}

// ── Live ticker ───────────────────────────────────────────────────────────────
const TICKER_ITEMS = [
  'Hospitalization', 'Pre-existing diseases', 'Maternity', 'Dental',
  'Cataract Surgery', 'ICU charges', 'AYUSH treatments', 'Organ transplant',
  'Mental health', 'Room rent limits', 'Waiting periods', 'Sub-limits',
  'Co-payment clauses', 'Deductibles', 'Claim exclusions', 'OPD cover',
]

function TickerTrack() {
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS]
  return (
    <div className="lp-ticker-outer" aria-hidden>
      <div className="lp-ticker-track">
        {items.map((item, i) => (
          <span key={i} className="lp-ticker-item">
            <span className="lp-ticker-dot" />
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Nav ───────────────────────────────────────────────────────────────────────
function Nav() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav className={`lp-nav ${scrolled ? 'lp-nav-scrolled' : ''}`}>
      <div className="lp-nav-inner">
        <div className="lp-nav-brand">
          <div className="brand-mark small">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          </div>
          <span className="lp-nav-name">Claim<span className="lp-accent">Lens</span></span>
        </div>
        <div className="lp-nav-links">
          <a href="#how-it-works" className="lp-nav-link">Preflight Workflow</a>
          <a href="#features" className="lp-nav-link">Core Features</a>
          <Link href="/app" className="lp-nav-cta">Launch Preflight →</Link>
        </div>
      </div>
    </nav>
  )
}

// ── Stats section ─────────────────────────────────────────────────────────────
function StatCard({ value, suffix, label, started }: { value: number; suffix: string; label: string; started: boolean }) {
  const count = useCounter(value, 1600, started)
  return (
    <div className="lp-stat">
      <div className="lp-stat-value">{count}<span className="lp-stat-suffix">{suffix}</span></div>
      <div className="lp-stat-label">{label}</div>
    </div>
  )
}

// ── Feature card ──────────────────────────────────────────────────────────────
function FeatureCard({ icon, title, desc, delay }: { icon: React.ReactNode; title: string; desc: string; delay: number }) {
  const { ref, inView } = useInView(0.1)
  return (
    <div
      ref={ref}
      className="lp-feature-card"
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? 'translateY(0)' : 'translateY(28px)',
        transition: `opacity 0.55s ${delay}ms ease, transform 0.55s ${delay}ms ease`,
      }}
    >
      <div className="lp-feature-icon">{icon}</div>
      <h3 className="lp-feature-title">{title}</h3>
      <p className="lp-feature-desc">{desc}</p>
    </div>
  )
}

// ── Step ──────────────────────────────────────────────────────────────────────
function Step({ n, title, desc, inView, delay }: { n: string; title: string; desc: string; inView: boolean; delay: number }) {
  return (
    <div
      className="lp-step"
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? 'translateX(0)' : 'translateX(-24px)',
        transition: `opacity 0.5s ${delay}ms ease, transform 0.5s ${delay}ms ease`,
      }}
    >
      <div className="lp-step-num">{n}</div>
      <div>
        <div className="lp-step-title">{title}</div>
        <div className="lp-step-desc">{desc}</div>
      </div>
    </div>
  )
}

// ── Main landing page ─────────────────────────────────────────────────────────
export default function LandingPage() {
  // Parallax scroll
  const [scrollY, setScrollY] = useState(0)
  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Hero text reveal
  const [heroReady, setHeroReady] = useState(false)
  useEffect(() => { const t = setTimeout(() => setHeroReady(true), 80); return () => clearTimeout(t) }, [])

  // Stats in-view
  const { ref: statsRef, inView: statsInView } = useInView(0.3)
  // How it works
  const { ref: stepsRef, inView: stepsInView } = useInView(0.2)
  // CTA strip
  const { ref: ctaRef, inView: ctaInView } = useInView(0.3)

  return (
    <div className="lp-root">
      <Nav />

      {/* ── HERO ── */}
      <section className="lp-hero">
        {/* Background image with parallax */}
        <div
          className="lp-hero-bg"
          style={{ transform: `translateY(${scrollY * 0.35}px)` }}
        />
        {/* Gradient overlay */}
        <div className="lp-hero-overlay" />

        <div className="lp-hero-content">

          {/* Headline — editorial layout, NOT centered big text */}
          <div className="lp-hero-headline-wrap">
            <h1
              className="lp-headline"
              style={{
                opacity: heroReady ? 1 : 0,
                transform: heroReady ? 'translateY(0)' : 'translateY(20px)',
                transition: 'opacity 0.7s 0.2s ease, transform 0.7s 0.2s ease',
              }}
            >
              Policy-to-Patient.<br />
              <span className="lp-headline-accent">Coverage Preflight.</span>
            </h1>
            <div
              className="lp-hero-side"
              style={{
                opacity: heroReady ? 1 : 0,
                transform: heroReady ? 'translateY(0)' : 'translateY(20px)',
                transition: 'opacity 0.7s 0.35s ease, transform 0.7s 0.35s ease',
              }}
            >
              <p className="lp-hero-desc">
                Before planned hospitalization, ClaimLens converts your insurance policy into auditable rules,
                applies them to patient scenarios in deterministic code, and explains your out-of-pocket patient share
                with Clause-to-Rupee traceability.
              </p>
              <div className="lp-hero-actions">
                <Link href="/app" className="lp-hero-btn-primary">
                  Launch Preflight
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                </Link>
                <a href="#features" className="lp-hero-btn-ghost">Explore Features</a>
              </div>
            </div>
          </div>

          {/* Live ticker */}
          <div
            style={{
              opacity: heroReady ? 1 : 0,
              transition: 'opacity 0.8s 0.6s ease',
              marginTop: 'clamp(32px, 5vw, 56px)',
            }}
          >
            <div className="lp-ticker-label">What we extract from your policy</div>
            <TickerTrack />
          </div>
        </div>

        {/* Scroll hint */}
        <div className="lp-scroll-hint">
          <div className="lp-scroll-line" />
          <span>scroll</span>
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="lp-stats-section" ref={statsRef}>
        <StatCard value={12} suffix=" categories" label="Policy clauses extracted" started={statsInView} />
        <div className="lp-stats-divider" />
        <StatCard value={100} suffix="%" label="Citation-backed answers" started={statsInView} />
        <div className="lp-stats-divider" />
        <StatCard value={30} suffix="+" label="Common treatments estimated" started={statsInView} />
        <div className="lp-stats-divider" />
        <StatCard value={60} suffix="s" label="Avg. analysis time" started={statsInView} />
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="lp-section" id="how-it-works" ref={stepsRef}>
        <div className="lp-section-inner lp-steps-layout">
          <div className="lp-section-label">How it works</div>
          <h2 className="lp-section-title">From PDF to clarity<br /><span className="lp-accent">in three steps</span></h2>
          <div className="lp-steps">
            <Step n="01" title="Upload your policy" desc="Drop any PDF — health, family floater, group policy. Up to 100 MB." inView={stepsInView} delay={0} />
            <div className="lp-steps-connector" />
            <Step n="02" title="AI reads every clause" desc="Our model extracts every coverage rule, exclusion, limit, waiting period, and claim condition — with the exact page and section it found it on." inView={stepsInView} delay={120} />
            <div className="lp-steps-connector" />
            <Step n="03" title="Ask, estimate, understand" desc="Chat conversationally with your policy. Run treatment cost scenarios and see the covered vs. out-of-pocket split instantly." inView={stepsInView} delay={240} />
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="lp-section lp-features-section" id="features">
        <div className="lp-section-inner">
          <div className="lp-section-label">Features</div>
          <h2 className="lp-section-title">Everything you need for<br /><span className="lp-accent">pre-admission certainty</span></h2>
          <div className="lp-features-grid">
            <FeatureCard delay={0} icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1v22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            } title="Clause-to-Rupee Traceability" desc="Every single deduction, co-pay, or room cap is traced directly from your hospital bill to verified policy wording with rupee amounts." />
            <FeatureCard delay={80} icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="16" y1="14" x2="16" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/></svg>
            } title="Deterministic Coverage Engine" desc="No hallucinated arithmetic. Coverage rules, waiting period date math, room proration, and sub-limits run in auditable TypeScript code." />
            <FeatureCard delay={160} icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
            } title="What-If Scenario Simulator" desc="Test what happens if you change room types, move your admission date, or cross an age co-pay threshold with live side-by-side deltas." />
            <FeatureCard delay={240} icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            } title="Missing Information Engine" desc="ClaimLens refuses false-confident answers. It detects missing start dates or PED declarations and asks the exact details needed." />
            <FeatureCard delay={320} icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            } title="Hospital Estimate First" desc="Upload your actual hospital estimate PDF or enter charge line items. Benchmark tariffs are used as transparent fallbacks." />
            <FeatureCard delay={400} icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            } title="Timeline & Pre-Auth Readiness" desc="Visual waiting-period milestones and an evidence-backed checklist of required forms and doctor notes before hospital admission." />
          </div>
        </div>
      </section>

      {/* ── CALLOUT / CTA ── */}
      <section className="lp-cta-section" ref={ctaRef}>
        <div
          className="lp-cta-card"
          style={{
            opacity: ctaInView ? 1 : 0,
            transform: ctaInView ? 'translateY(0) scale(1)' : 'translateY(32px) scale(0.98)',
            transition: 'opacity 0.6s ease, transform 0.6s ease',
          }}
        >
          <div className="lp-cta-glow" />
          <p className="lp-cta-eyebrow">Preflight Pre-Admission</p>
          <h2 className="lp-cta-headline">Stop guessing. Know your patient share.</h2>
          <p className="lp-cta-sub">
            Upload your policy and quotation now — get an auditable preflight in under 60 seconds.
          </p>
          <Link href="/app" className="lp-hero-btn-primary">
            Launch Preflight
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-nav-brand">
            <div className="brand-mark small">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            </div>
            <span className="lp-nav-name">Claim<span className="lp-accent">Lens</span></span>
          </div>
          <p className="lp-footer-note">
            ClaimLens is an auditable pre-admission coverage preflight and estimation tool. It does not constitute insurer authorization, claim settlement, or legal advice.
          </p>
        </div>
      </footer>
    </div>
  )
}
