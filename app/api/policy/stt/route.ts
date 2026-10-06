import { NextRequest, NextResponse } from 'next/server'
import { transcribeSpeech } from '@/lib/ai/speech'
import { askPolicyQuestion } from '@/lib/ai/ask'
import type { ExtractedPage } from '@/lib/types/policy'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    let audioBase64 = ''
    let mimeType = 'audio/webm'
    let pages: ExtractedPage[] | undefined = undefined
    let autoAsk = true

    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('audio') as Blob | File | null
      if (!file) {
        return NextResponse.json(
          { success: false, error: 'Audio file is required in form-data.' },
          { status: 400 },
        )
      }
      mimeType = file.type || 'audio/webm'
      const arrayBuffer = await file.arrayBuffer()
      audioBase64 = Buffer.from(arrayBuffer).toString('base64')

      const pagesStr = formData.get('pages') as string | null
      if (pagesStr) {
        try {
          pages = JSON.parse(pagesStr)
        } catch {
          pages = undefined
        }
      }
      const autoAskStr = formData.get('autoAsk') as string | null
      if (autoAskStr === 'false') {
        autoAsk = false
      }
    } else {
      const body = await request.json()
      audioBase64 = body.audioBase64 || body.audio
      mimeType = body.mimeType || 'audio/webm'
      pages = body.pages
      if (body.autoAsk === false) {
        autoAsk = false
      }
    }

    if (!audioBase64) {
      return NextResponse.json(
        { success: false, error: 'Audio base64 data or audio file is required.' },
        { status: 400 },
      )
    }

    // 1. Transcribe audio to text (Hinglish/English/Hindi compatible)
    const sttResult = await transcribeSpeech(audioBase64, mimeType)
    const transcript = sttResult.text

    if (!transcript) {
      return NextResponse.json(
        { success: false, error: 'Could not recognize speech from audio.' },
        { status: 422 },
      )
    }

    // 2. If pages provided & autoAsk enabled, route to existing LLM chatbot framework
    if (autoAsk && pages && Array.isArray(pages) && pages.length > 0) {
      const qaResult = await askPolicyQuestion(transcript, pages)
      return NextResponse.json({
        success: true,
        transcript,
        provider: sttResult.provider,
        data: qaResult,
      })
    }

    // Otherwise return just transcription
    return NextResponse.json({
      success: true,
      transcript,
      provider: sttResult.provider,
    })
  } catch (err: any) {
    console.error('[policy/stt]', err)
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Failed to process speech to text.',
      },
      { status: 500 },
    )
  }
}
