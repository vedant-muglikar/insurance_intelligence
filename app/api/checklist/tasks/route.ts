import { NextRequest, NextResponse } from 'next/server'
import { checklistError, getChecklistContext, NO_STORE, toErrorResponse } from '@/lib/checklist/http'
import { updateTaskState } from '@/lib/checklist/service'

export const runtime = 'nodejs'

/** Update a task's completion status and/or due date (reopening = status "pending") */
export async function PATCH(request: NextRequest) {
  const ctx = await getChecklistContext()
  if (ctx instanceof NextResponse) return ctx
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return checklistError(400, 'invalid', 'Invalid JSON body.')
    const data = await updateTaskState(ctx.repo, ctx.userId, body)
    return NextResponse.json({ success: true, data }, { headers: NO_STORE })
  } catch (err) {
    return toErrorResponse(err, 'task')
  }
}
