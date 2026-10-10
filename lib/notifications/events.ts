/** Fired when checklist data changes, so the notification bell re-fetches without waiting for its poll */
export const NOTIFICATIONS_REFRESH_EVENT = 'claimlens:notifications-refresh'

export function requestNotificationsRefresh() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(NOTIFICATIONS_REFRESH_EVENT))
}
