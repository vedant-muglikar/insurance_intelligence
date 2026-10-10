import { NextRequest, NextResponse } from 'next/server'
import { checklistError, getChecklistContext, NO_STORE, toErrorResponse } from '@/lib/checklist/http'
import { attachmentDownloadUrl, removeAttachment } from '@/lib/checklist/service'

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Redirect to a 60-second signed URL for the owner's document */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) return checklistError(400, 'invalid', 'Invalid attachment id.')
  const ctx = await getChecklistContext()
  if (ctx instanceof NextResponse) return ctx
  try {
    const url = await attachmentDownloadUrl(ctx.repo, ctx.userId, id)
    return NextResponse.redirect(url, { status: 302, headers: NO_STORE })
  } catch (err) {
    return toErrorResponse(err, 'download')
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) return checklistError(400, 'invalid', 'Invalid attachment id.')
  const ctx = await getChecklistContext()
  if (ctx instanceof NextResponse) return ctx
  try {
    await removeAttachment(ctx.repo, ctx.userId, id)
    return NextResponse.json({ success: true }, { headers: NO_STORE })
  } catch (err) {
    return toErrorResponse(err, 'delete-attachment')
  }
}
