'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

type State = 'loading' | 'ready' | 'fallback'

/** The BimaSetu emblem in 3D: tilts toward the pointer, drags to spin, and reacts to taps on the shield and people. */
export function Logo3D() {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<State>('loading')

  useEffect(() => {
    const stage = stageRef.current
    const canvas = canvasRef.current
    if (!stage || !canvas) return
    let cancelled = false
    let unmount: (() => void) | undefined

    // The proof panel is display:none below 1024px, so phones never intersect and never download three.js.
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      io.disconnect()
      import('./logo-scene')
        .then(({ mountLogoScene }) => {
          if (cancelled) return
          unmount = mountLogoScene(canvas, stage, { onReady: () => setState('ready') })
        })
        .catch(() => {
          if (!cancelled) setState('fallback')
        })
    })
    io.observe(stage)

    return () => {
      cancelled = true
      io.disconnect()
      unmount?.()
    }
  }, [])

  return (
    <div className="lg-logo" data-state={state}>
      <div
        ref={stageRef}
        className="lg-logo-stage"
        role="img"
        aria-label="BimaSetu logo: a bridge carrying a health shield between two people"
      >
        <span className="lg-logo-halo" aria-hidden />
        <canvas ref={canvasRef} className="lg-logo-canvas" aria-hidden />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/bimasetu-mark.png" alt="" className="lg-logo-fallback" aria-hidden />
      </div>

      <Link href="/" className="lg-logo-word" aria-label="BimaSetu home">
        <span className="lg-logo-bima">Bima</span>
        <span className="lg-logo-setu">
          <span className="lg-logo-setu-ink">Setu</span>
        </span>
      </Link>
      <p className="lg-logo-tag">Policy se clarity tak.</p>
    </div>
  )
}
