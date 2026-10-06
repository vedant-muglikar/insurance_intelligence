import { NextRequest, NextResponse } from 'next/server'
import { convertTextToSpeech } from '@/lib/ai/speech'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const text = body.text

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Text parameter is required.' },
        { status: 400 },
      )
    }

    const ttsResult = await convertTextToSpeech(text)

    if (!ttsResult.success) {
      return NextResponse.json(
        { success: false, error: ttsResult.error || 'TTS synthesis failed.' },
        { status: 500 },
      )
    }

    if (!ttsResult.useFallback && ttsResult.audioBuffer) {
      const audioBase64 = ttsResult.audioBuffer.toString('base64')
      return NextResponse.json({
        success: true,
        useFallback: false,
        mimeType: ttsResult.mimeType || 'audio/mpeg',
        audioBase64,
        cleanedText: ttsResult.cleanedText,
        provider: ttsResult.provider,
      })
    }

    // Fallback mode for client-side Web Speech API
    return NextResponse.json({
      success: true,
      useFallback: true,
      cleanedText: ttsResult.cleanedText,
      provider: ttsResult.provider || 'fallback',
      message: 'No cloud TTS API key configured. Client will use browser Web Speech API.',
    })
  } catch (err: any) {
    console.error('[policy/tts]', err)
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Text to speech conversion failed.',
      },
      { status: 500 },
    )
  }
}
