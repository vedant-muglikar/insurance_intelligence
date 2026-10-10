// ─── In-app notifications ───────────────────────────────────────────────────

export type NotificationKind =
  | 'task_overdue'
  | 'task_due_today'
  | 'task_due_soon'
  | 'admission_soon'
  | 'risk_alert'
  | 'checklist_created'
  | 'checklist_updated'

export type NotificationSeverity = 'high' | 'medium' | 'info'

/** A notification before it is stored: `key` is stable for the same underlying condition */
export interface NotificationDraft {
  key: string
  kind: NotificationKind
  severity: NotificationSeverity
  title: string
  body: string
  checklistId: string | null
  policyKey: string | null
  /** Plan or insurer name, so notifications from other policies are recognisable */
  policyLabel: string | null
  taskKey: string | null
}

export interface AppNotification extends NotificationDraft {
  id: string
  createdAt: string
  readAt: string | null
}

export interface NotificationList {
  items: AppNotification[]
  /** false when read/dismissed state cannot be stored on the server (the client keeps it instead) */
  persisted: boolean
}
