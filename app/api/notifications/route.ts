import { NextRequest, NextResponse } from 'next/server'
import { checklistError, getChecklistContext, NO_STORE, toErrorResponse } from '@/lib/checklist/http'
import { daysUntil, isIsoDate } from '@/lib/notifications/derive'
import { NotificationStorageUnavailableError, SupabaseNotificationRepository } from '@/lib/notifications/repository'
import { listNotifications, markNotifications } from '@/lib/notifications/service'

export const runtime = 'nodejs'

/**
 * "Today" comes from the user's device so due dates match their calendar, not
 * the server's UTC date; anything more than a day away from UTC is ignored.
 */
function resolveToday(param: string | null): string {
  const utc = new Date().toISOString().slice(0, 10)
  return isIsoDate(param) && Math.abs(daysUntil(utc, param)) <= 1 ? param : utc
}

/** Current notifications: GET /api/notifications?today=YYYY-MM-DD */
export async function GET(request: NextRequest) {
  const ctx = await getChecklistContext()
  if (ctx instanceof NextResponse) return ctx
  try {
    const today = resolveToday(request.nextUrl.searchParams.get('today'))
    const data = await listNotifications(ctx.repo, new SupabaseNotificationRepository(ctx.db), ctx.userId, today)
    return NextResponse.json({ success: true, data }, { headers: NO_STORE })
  } catch (err) {
    return toErrorResponse(err, 'notifications')
  }
}

/** Mark as read or dismiss: { action: 'read' | 'dismiss', ids?: string[], all?: true } */
export async function PATCH(request: NextRequest) {
  const ctx = await getChecklistContext()
  if (ctx instanceof NextResponse) return ctx
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return checklistError(400, 'invalid', 'Invalid JSON body.')
    await markNotifications(new SupabaseNotificationRepository(ctx.db), ctx.userId, body)
    return NextResponse.json({ success: true }, { headers: NO_STORE })
  } catch (err) {
    if (err instanceof NotificationStorageUnavailableError) return checklistError(503, 'storage_unavailable', err.message)
    return toErrorResponse(err, 'notifications')
  }
}
