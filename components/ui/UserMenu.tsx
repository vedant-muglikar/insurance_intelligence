'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { LogOut, User, ChevronDown } from 'lucide-react'

export function UserMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setEmail(user.email ?? null)
      }
    }
    getUser()
  }, [supabase])

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  if (!email) {
    return (
      <div className="animate-pulse h-8 w-24 bg-slate-800/50 rounded-lg"></div>
    )
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800/80 hover:border-slate-600 focus:outline-none"
      >
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
          <User size={12} />
        </div>
        <span className="max-w-[120px] truncate sm:max-w-[160px]">{email}</span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 origin-top-right rounded-xl border border-slate-700 bg-[#0a1018] py-1 shadow-2xl backdrop-blur-xl ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
          <div className="px-4 py-2 border-b border-slate-800">
            <p className="text-xs text-slate-400">Signed in as</p>
            <p className="truncate text-sm font-semibold text-slate-200">{email}</p>
          </div>
          <div className="py-1">
            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-slate-800/60 hover:text-red-300 transition-colors"
            >
              <LogOut size={14} />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
