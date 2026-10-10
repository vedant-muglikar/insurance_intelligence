import { NextRequest, NextResponse } from 'next/server'
import { checklistError, getChecklistContext, NO_STORE, toErrorResponse } from '@/lib/checklist/http'
import { addAttachment } from '@/lib/checklist/service'
import { MAX_ATTACHMENT_BYTES } from '@/lib/checklist/attachments'

export const runtime = 'nodejs'

/** Attach a supporting document (multipart: checklistId, taskKey, file) */
export async function POST(request: NextRequest) {
  const ctx = await getChecklistContext()
  if (ctx instanceof NextResponse) return ctx
  try {
    const form = await request.formData()
    const file = form.get('file')
    const checklistId = form.get('checklistId')
    const taskKey = form.get('taskKey')
    if (!(file instanceof File)) return checklistError(400, 'invalid', 'No file provided.')
    if (typeof checklistId !== 'string' || typeof taskKey !== 'string') {
      return checklistError(400, 'invalid', 'checklistId and taskKey are required.')
    }
    if (file.size > MAX_ATTACHMENT_BYTES) return checklistError(413, 'invalid', 'Files must be 10 MB or smaller.')

    const data = await addAttachment(ctx.repo, ctx.userId, {
      checklistId,
      taskKey,
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    })
    return NextResponse.json({ success: true, data }, { headers: NO_STORE })
  } catch (err) {
    return toErrorResponse(err, 'attach')
  }
}
