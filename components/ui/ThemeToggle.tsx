'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from '@phosphor-icons/react'

type Theme = 'dark' | 'light'

/** Dark is the default. The choice is stored in localStorage and applied before paint by the layout script. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')
  }, [])

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    const root = document.documentElement
    // Brief colour crossfade, only when the user has not asked for reduced motion.
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.classList.add('pl-theme-fade')
      window.setTimeout(() => root.classList.remove('pl-theme-fade'), 320)
    }
    root.dataset.theme = next
    try {
      localStorage.setItem('pl-theme', next)
    } catch {}
    setTheme(next)
  }

  const toLight = theme === 'dark'
  return (
    <button
      type="button"
      className={`pl-theme-toggle ${className}`}
      onClick={toggle}
      aria-label={toLight ? 'Switch to light mode' : 'Switch to dark mode'}
      title={toLight ? 'Light mode' : 'Dark mode'}
    >
      {toLight ? <Sun size={18} weight="bold" aria-hidden /> : <Moon size={18} weight="bold" aria-hidden />}
    </button>
  )
}
