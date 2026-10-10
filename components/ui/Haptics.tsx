'use client'

import { useEffect } from 'react'

/** Light tap feedback on touch devices that support it (Android Chrome). Silent elsewhere and with reduced motion. */
export function Haptics() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      const el = (e.target as HTMLElement | null)?.closest('button, [role="tab"], [role="button"], a.pl-btn, .sx-tap')
      if (el && !(el as HTMLButtonElement).disabled) navigator.vibrate(8)
    }
    document.addEventListener('pointerdown', onDown, { passive: true })
    return () => document.removeEventListener('pointerdown', onDown)
  }, [])
  return null
}
