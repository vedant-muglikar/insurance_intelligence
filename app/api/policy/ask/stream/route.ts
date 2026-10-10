import { NextRequest } from 'next/server'
import { streamPolicyAnswer } from '@/lib/ai/ask'
import { loadChatContext } from '@/lib/policy/store'
import type { AskRequest, ExtractedPage, PolicyRule } from '@/lib/types/policy'

export const maxDuration = 120

/**
 * Streaming Q&A for the voice chat. Responds with newline-delimited JSON:
 *   {"t":"delta","text":"..."}  answer text as it is generated
 *   {"t":"done","data":{...}}   the validated answer with citations
 *   {"t":"error","error":"..."}
 */
export async function POST(request: NextRequest) {
  let body: Partial<AskRequest> & { spoken?: boolean; planTemplateId?: string | null }
  try {
    body = await request.json()
  } catch {
    return Response.json({ success: false, error: 'Invalid request body.' }, { status: 400 })
  }
  if (!body.question || typeof body.question !== 'string') {
    return Response.json({ success: false, error: 'Question is required.' }, { status: 400 })
  }
  // Prefer the saved copy of the policy; fall back to pages sent by the browser (samples, or saving disabled).
  let pages: ExtractedPage[] | undefined
  let rules: PolicyRule[] | undefined
  if (body.planTemplateId && /^[0-9a-f-]{36}$/i.test(body.planTemplateId)) {
    const ctx = await loadChatContext(body.planTemplateId)
    if (ctx) {
      pages = ctx.pages
      rules = ctx.rules
    }
  }
  if (!pages && Array.isArray(body.pages) && body.pages.length > 0) pages = body.pages
  if (!pages) {
    return Response.json({ success: false, error: 'No policy text available for this question.' }, { status: 400 })
  }

  const enc = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + '\n'))
      try {
        const data = await streamPolicyAnswer(
          {
            question: body.question as string,
            pages,
            rules,
            history: body.history,
            scenarioContext: body.scenarioContext,
            spoken: body.spoken,
          },
          (text) => send({ t: 'delta', text }),
        )
        send({ t: 'done', data })
      } catch (err: any) {
        console.error('[policy/ask/stream]', err)
        send({ t: 'error', error: err?.message || 'Something went wrong.' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
