'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChecklistState } from '@/lib/types/checklist'
import type { AppNotification, NotificationList } from '@/lib/types/notifications'
import { deriveNotifications, localToday, sortNotifications } from '@/lib/notifications/derive'
import { NOTIFICATIONS_REFRESH_EVENT } from '@/lib/notifications/events'
import { LOCAL_PREFIX } from '@/components/policy/checklist/useChecklist'

const MARKS_KEY = 'claimlens:notifications'
const POLL_MS = 5 * 60_000

/** Read / dismissed / first-seen times, kept on the device when the server cannot store them */
type LocalMarks = { read: Record<string, string>; dismissed: Record<string, string>; seen: Record<string, string> }

function readMarks(): LocalMarks {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MARKS_KEY) ?? '')
    return { read: parsed.read ?? {}, dismissed: parsed.dismissed ?? {}, seen: parsed.seen ?? {} }
  } catch {
    return { read: {}, dismissed: {}, seen: {} }
  }
}

function writeMarks(marks: LocalMarks) {
  try {
    window.localStorage.setItem(MARKS_KEY, JSON.stringify(marks))
  } catch {}
}

/** Applies device-stored marks, dropping marks for notifications that no longer exist */
function applyLocalMarks(items: AppNotification[]): AppNotification[] {
  const marks = readMarks()
  const now = new Date().toISOString()
  const next: LocalMarks = { read: {}, dismissed: {}, seen: {} }
  for (const { id } of items) {
    if (marks.read[id]) next.read[id] = marks.read[id]
    if (marks.dismissed[id]) next.dismissed[id] = marks.dismissed[id]
    next.seen[id] = marks.seen[id] ?? now
  }
  writeMarks(next)
  return sortNotifications(
    items
      .filter((n) => !next.dismissed[n.id])
      .map((n) => ({ ...n, createdAt: next.seen[n.id], readAt: next.read[n.id] ?? null })),
  )
}

/** Device-only checklists, for visitors who are signed out or without checklist storage */
function readLocalChecklists(): ChecklistState[] {
  const states: ChecklistState[] = []
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (!key?.startsWith(LOCAL_PREFIX)) continue
      const state = JSON.parse(window.localStorage.getItem(key) ?? 'null') as ChecklistState | null
      if (state?.checklist && Array.isArray(state.tasks)) states.push(state)
    }
  } catch {}
  return states
}

export function useNotifications() {
  const [items, setItems] = useState<AppNotification[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const itemsRef = useRef(items)
  itemsRef.current = items
  /** Read state lives on this device rather than the server */
  const local = useRef(false)
  const seq = useRef(0)

  const refresh = useCallback(async () => {
    const run = ++seq.current
    const today = localToday()
    let next: AppNotification[]
    try {
      const res = await fetch(`/api/notifications?today=${today}`, { credentials: 'same-origin', cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.success && json.data) {
        const data = json.data as NotificationList
        local.current = !data.persisted
        next = local.current ? applyLocalMarks(data.items) : data.items
      } else if (res.status === 401 || res.status === 503) {
        local.current = true
        const drafts = deriveNotifications(readLocalChecklists(), today)
        next = applyLocalMarks(drafts.map((d) => ({ ...d, id: d.key, createdAt: '', readAt: null })))
      } else {
        throw new Error(json.error || `Could not load notifications (${res.status})`)
      }
    } catch {
      if (run === seq.current) setStatus((s) => (s === 'ready' ? s : 'error'))
      return
    }
    if (run !== seq.current) return // a newer refresh already started
    setItems(next)
    setStatus('ready')
  }, [])

  useEffect(() => {
    void refresh()
    let timer: number | undefined
    const soon = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void refresh(), 400)
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') soon()
    }
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, POLL_MS)
    window.addEventListener(NOTIFICATIONS_REFRESH_EVENT, soon)
    window.addEventListener('focus', soon)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(timer)
      window.clearInterval(poll)
      window.removeEventListener(NOTIFICATIONS_REFRESH_EVENT, soon)
      window.removeEventListener('focus', soon)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  const update = useCallback(
    async (action: 'read' | 'dismiss', ids: string[] | 'all') => {
      const now = new Date().toISOString()
      const targets = ids === 'all' ? itemsRef.current.map((n) => n.id) : ids
      const hit = new Set(targets)
      setItems((prev) =>
        action === 'dismiss'
          ? prev.filter((n) => !hit.has(n.id))
          : prev.map((n) => (hit.has(n.id) && !n.readAt ? { ...n, readAt: now } : n)),
      )

      if (local.current) {
        const marks = readMarks()
        for (const id of targets) marks[action === 'read' ? 'read' : 'dismissed'][id] = now
        writeMarks(marks)
        return
      }
      try {
        const res = await fetch('/api/notifications', {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ids === 'all' ? { action, all: true } : { action, ids }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
      } catch {
        void refresh() // put the server's state back
      }
    },
    [refresh],
  )

  return {
    items,
    status,
    unread: items.filter((n) => !n.readAt).length,
    refresh,
    markRead: (ids: string[] | 'all') => update('read', ids),
    dismiss: (id: string) => update('dismiss', [id]),
  }
}
