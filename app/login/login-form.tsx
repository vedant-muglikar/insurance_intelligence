'use client'

import { useId, useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { ArrowRight, Eye, EyeSlash, SpinnerGap, WarningCircle, CheckCircle } from '@phosphor-icons/react'
import { login, signup } from './actions'
import { GoogleSignInButton } from './oauth-buttons'

type Mode = 'signin' | 'signup'

const COPY: Record<Mode, { title: string; sub: string; cta: string; pending: string }> = {
  signin: {
    title: 'Welcome back',
    sub: 'Sign in to run your coverage preflight.',
    cta: 'Sign in',
    pending: 'Signing in…',
  },
  signup: {
    title: 'Create your account',
    sub: 'Start a preflight in under a minute.',
    cta: 'Create account',
    pending: 'Creating account…',
  },
}

function scorePassword(pw: string) {
  let s = 0
  if (pw.length >= 8) s++
  if (pw.length >= 12) s++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++
  return s
}

const STRENGTH_LABEL = ['Too short', 'Weak', 'Okay', 'Good', 'Strong']

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="lg-submit" disabled={pending} aria-live="polite">
      {pending ? (
        <>
          <SpinnerGap size={18} weight="bold" className="lg-spin" aria-hidden /> {pendingLabel}
        </>
      ) : (
        <>
          {label} <ArrowRight size={18} weight="bold" className="lg-arrow" aria-hidden />
        </>
      )}
    </button>
  )
}

export function LoginForm({ message, status }: { message?: string; status: 'error' | 'success' }) {
  const [mode, setMode] = useState<Mode>('signin')
  const [showPw, setShowPw] = useState(false)
  const [password, setPassword] = useState('')
  const [dismissed, setDismissed] = useState(false)
  const uid = useId()
  const copy = COPY[mode]
  const strength = useMemo(() => scorePassword(password), [password])

  const switchMode = (m: Mode) => {
    setMode(m)
    setDismissed(true)
  }

  return (
    <div className="lg-form-wrap">
      <div className="lg-switch" role="tablist" aria-label="Sign in or create an account" data-mode={mode}>
        <span className="lg-switch-thumb" aria-hidden />
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'signin'}
          className="lg-switch-btn"
          onClick={() => switchMode('signin')}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'signup'}
          className="lg-switch-btn"
          onClick={() => switchMode('signup')}
        >
          Create account
        </button>
      </div>

      <div className="lg-head" key={mode}>
        <h1 className="lg-title">{copy.title}</h1>
        <p className="lg-sub">{copy.sub}</p>
      </div>

      <GoogleSignInButton />

      <div className="lg-or" role="separator">
        <span>or use email</span>
      </div>

      <form action={mode === 'signin' ? login : signup} className="lg-form">
        <div className="lg-field">
          <label htmlFor={`${uid}-email`}>Email</label>
          <input
            id={`${uid}-email`}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
          />
        </div>

        <div className="lg-field">
          <label htmlFor={`${uid}-pw`}>Password</label>
          <div className="lg-pw">
            <input
              id={`${uid}-pw`}
              name="password"
              type={showPw ? 'text' : 'password'}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              placeholder={mode === 'signin' ? 'Your password' : 'At least 8 characters'}
              minLength={mode === 'signup' ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="lg-eye"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? 'Hide password' : 'Show password'}
              aria-pressed={showPw}
            >
              {showPw ? <EyeSlash size={19} /> : <Eye size={19} />}
            </button>
          </div>

          {mode === 'signup' && (
            <div className="lg-strength" data-level={password ? strength : -1}>
              <div className="lg-strength-bars" aria-hidden>
                <i />
                <i />
                <i />
                <i />
              </div>
              <span>{password ? STRENGTH_LABEL[strength] : 'Use 8 or more characters. Mixing letters and numbers helps.'}</span>
            </div>
          )}
        </div>

        {message && !dismissed && (
          <div className="lg-alert" data-status={status} role={status === 'error' ? 'alert' : 'status'}>
            {status === 'error' ? <WarningCircle size={19} weight="bold" aria-hidden /> : <CheckCircle size={19} weight="bold" aria-hidden />}
            <span>{message}</span>
          </div>
        )}

        <SubmitButton label={copy.cta} pendingLabel={copy.pending} />
      </form>

      <p className="lg-switch-hint">
        {mode === 'signin' ? 'New to PolicyLens?' : 'Already have an account?'}{' '}
        <button type="button" onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}>
          {mode === 'signin' ? 'Create an account' : 'Sign in'}
        </button>
      </p>
    </div>
  )
}
