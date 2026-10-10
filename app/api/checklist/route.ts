import { NextRequest, NextResponse } from 'next/server'
import { getChecklistContext, NO_STORE, toErrorResponse, checklistError } from '@/lib/checklist/http'
import { loadChecklist, syncChecklist, type SyncChecklistInput } from '@/lib/checklist/service'

export const runtime = 'nodejs'

/** Restore a saved checklist: GET /api/checklist?policyKey=pdf:… */
export async function GET(request: NextRequest) {
  const ctx = await getChecklistContext()
  if (ctx instanceof NextResponse) return ctx
  try {
    const data = await loadChecklist(ctx.repo, ctx.userId, request.nextUrl.searchParams.get('policyKey') ?? '')
    if (!data) return checklistError(404, 'not_found', 'No checklist saved for this policy yet.')
    return NextResponse.json({ success: true, data }, { headers: NO_STORE })
  } catch (err) {
    return toErrorResponse(err, 'load')
  }
}

const MAX_BODY_BYTES = 2 * 1024 * 1024

/** Create or regenerate the checklist from extracted policy data (+ optional scenario) */
export async function POST(request: NextRequest) {
  const ctx = await getChecklistContext()
  if (ctx instanceof NextResponse) return ctx
  try {
    const raw = await request.text()
    if (raw.length > MAX_BODY_BYTES) return checklistError(413, 'invalid', 'Request too large.')
    let body: SyncChecklistInput
    try {
      body = JSON.parse(raw)
    } catch {
      return checklistError(400, 'invalid', 'Invalid JSON body.')
    }
    const data = await syncChecklist(ctx.repo, ctx.userId, body)
    return NextResponse.json({ success: true, data }, { headers: NO_STORE })
  } catch (err) {
    return toErrorResponse(err, 'sync')
  }
}
