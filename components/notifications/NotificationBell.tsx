'use client'

import { useEffect, useId, useRef, useState } from 'react'
import {
  Bell,
  CalendarBlank,
  Checks,
  Clock,
  ListChecks,
  ShieldWarning,
  WarningCircle,
  X,
  type Icon,
} from '@phosphor-icons/react'
import type { AppNotification, NotificationKind } from '@/lib/types/notifications'
import { formatDateIndian } from '@/lib/policy/normalizers'
import { useNotifications } from './useNotifications'

const KIND_ICON: Record<NotificationKind, Icon> = {
  task_overdue: WarningCircle,
  task_due_today: Clock,
  task_due_soon: CalendarBlank,
  admission_soon: CalendarBlank,
  risk_alert: ShieldWarning,
  checklist_created: ListChecks,
  checklist_updated: ListChecks,
}

function timeAgo(iso: string): string {
  const ms = Date.now() - Date.parse(iso)
  if (!Number.isFinite(ms) || ms < 60_000) return 'Just now'
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return days < 7 ? `${days}d ago` : formatDateIndian(iso)
}

interface NotificationBellProps {
  /** Policy open on this screen; its notifications can jump straight to the task */
  currentPolicyKey?: string
  onOpenTask?: (taskKey: string | null) => void
}

export function NotificationBell({ currentPolicyKey, onOpenTask }: NotificationBellProps) {
  const { items, status, unread, refresh, markRead, dismiss } = useNotifications()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = () => {
    if (!open) void refresh()
    setOpen((o) => !o)
  }

  const canOpen = (n: AppNotification) => !!onOpenTask && !!n.policyKey && n.policyKey === currentPolicyKey

  const select = (n: AppNotification) => {
    if (!n.readAt) void markRead([n.id])
    if (canOpen(n)) {
      onOpenTask?.(n.taskKey)
      setOpen(false)
    }
  }

  return (
    <div className="sx-notif" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="sx-notif-btn"
        onClick={toggle}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title="Notifications"
      >
        <Bell size={20} weight={unread ? 'fill' : 'bold'} aria-hidden />
        {unread > 0 && (
          <span className="sx-notif-badge notranslate" aria-hidden>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div id={panelId} role="dialog" aria-label="Notifications" className="sx-notif-panel">
          <div className="sx-notif-head">
            <h2>Notifications</h2>
            {unread > 0 && (
              <button type="button" className="sx-notif-link" onClick={() => void markRead('all')}>
                <Checks size={16} weight="bold" aria-hidden />
                Mark all read
              </button>
            )}
          </div>

          <div className="sx-notif-list">
            {items.length === 0 && status === 'loading' && <p className="sx-notif-status">Loading…</p>}
            {items.length === 0 && status === 'error' && (
              <div className="sx-notif-status">
                <p>Couldn’t load notifications.</p>
                <button type="button" className="sx-notif-link" onClick={() => void refresh()}>
                  Try again
                </button>
              </div>
            )}
            {items.length === 0 && status === 'ready' && (
              <div className="sx-notif-empty">
                <Bell size={28} weight="duotone" aria-hidden />
                <p className="sx-notif-empty-title">You’re all caught up</p>
                <p>Reminders for checklist due dates and policy updates will show up here.</p>
              </div>
            )}

            {items.map((n) => {
              const KindIcon = KIND_ICON[n.kind] ?? Bell
              const navigable = canOpen(n)
              return (
                <article
                  key={n.id}
                  className={`sx-notif-item${n.readAt ? '' : ' is-unread'}`}
                  data-kind={n.kind}
                  data-severity={n.severity}
                >
                  <button type="button" className="sx-notif-main" onClick={() => select(n)}>
                    <span className="sx-notif-icon" aria-hidden>
                      <KindIcon size={18} weight="bold" />
                    </span>
                    <span className="sx-notif-text">
                      <span className="sx-notif-title">
                        {!n.readAt && <span className="sr-only">Unread: </span>}
                        {n.title}
                      </span>
                      <span className="sx-notif-body">{n.body}</span>
                      <span className="sx-notif-meta">
                        {n.policyLabel && <span className="sx-notif-policy">{n.policyLabel}</span>}
                        <span>{timeAgo(n.createdAt)}</span>
                        {navigable && n.taskKey && <span className="sx-notif-go">View task →</span>}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="sx-notif-dismiss"
                    onClick={() => void dismiss(n.id)}
                    aria-label={`Dismiss: ${n.title}`}
                    title="Dismiss"
                  >
                    <X size={14} weight="bold" aria-hidden />
                  </button>
                </article>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
