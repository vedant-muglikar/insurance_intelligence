import { getBestGeminiModel } from './extractor'

/**
 * Clean up text for Text-to-Speech synthesis by removing markdown,
 * citations, bullet markers, and excessive formatting so it reads naturally.
 */
export function cleanTextForSpeech(text: string): string {
  if (!text) return ''
  return text
    // Remove markdown bold/italic formatting
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    // Remove markdown headers
    .replace(/#+\s+/g, '')
    // Remove citation references like [PAGE 12] or (Page 5)
    .replace(/\[PAGE\s*\d+\]/gi, '')
    .replace(/\(Page\s*\d+\)/gi, '')
    // Remove URL-like text or file links
    .replace(/https?:\/\/\S+/g, '')
    // Replace multiple newlines/spaces with single space
    .replace(/\s+/g, ' ')
    .trim()
}

export interface STTResult {
  text: string
  provider: 'gemini' | 'openai' | 'fallback'
}

export interface TTSResult {
  success: boolean
  audioBuffer?: Buffer
  mimeType?: string
  useFallback: boolean
  cleanedText: string
  provider?: 'openai' | 'elevenlabs' | 'google' | 'fallback'
  error?: string
}

/**
 * Speech-to-Text: Converts audio payload into transcribed text.
 * Supports Hinglish (Hindi + English), English, and Hindi.
 */
export async function transcribeSpeech(
  audioBase64: string,
  mimeType: string = 'audio/webm',
): Promise<STTResult> {
  const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  const openaiKey = process.env.OPENAI_API_KEY

  if (!googleKey && !openaiKey) {
    throw new Error('No AI API key found for audio transcription. Please configure GOOGLE_GENERATIVE_AI_API_KEY or OPENAI_API_KEY.')
  }

  // 1. Try Gemini audio transcription if Google key is available
  if (googleKey) {
    try {
      const model = await getBestGeminiModel(googleKey)
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${googleKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    inlineData: {
                      mimeType: mimeType || 'audio/webm',
                      data: audioBase64,
                    },
                  },
                  {
                    text: 'Transcribe this spoken audio accurately. The speaker may use Hinglish (a mix of Hindi and English, e.g. "is policy mein maternity cover hai kya?", "room rent limit kitni hai?"), English, or Hindi. Return ONLY the plain text transcription without quotes, labels, or formatting.',
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 1024,
            },
          }),
        },
      )

      if (response.ok) {
        const json = await response.json()
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
        if (text) {
          return { text, provider: 'gemini' }
        }
      } else {
        const errText = await response.text()
        console.warn('[STT] Gemini transcription returned non-200:', response.status, errText)
      }
    } catch (err) {
      console.warn('[STT] Gemini transcription error, attempting OpenAI fallback if available:', err)
    }
  }

  // 2. Try OpenAI Whisper if OpenAI key is available
  if (openaiKey) {
    try {
      const buffer = Buffer.from(audioBase64, 'base64')
      const blob = new Blob([buffer], { type: mimeType })
      const formData = new FormData()
      formData.append('file', blob, `speech.${mimeType.split('/')[1] || 'webm'}`)
      formData.append('model', 'whisper-1')
      formData.append('prompt', 'Hinglish, Hindi, and English insurance questions transcription.')

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiKey}`,
        },
        body: formData,
      })

      if (response.ok) {
        const json = await response.json()
        if (json.text) {
          return { text: json.text.trim(), provider: 'openai' }
        }
      } else {
        const errText = await response.text()
        console.warn('[STT] OpenAI Whisper returned non-200:', response.status, errText)
      }
    } catch (err) {
      console.warn('[STT] OpenAI Whisper error:', err)
    }
  }

  throw new Error('Could not transcribe audio with configured AI providers.')
}

/**
 * Text-to-Speech: Converts text output to spoken audio.
 * Checks for external API keys (ElevenLabs, OpenAI, Google TTS).
 * If no cloud key is provided, returns useFallback: true so front-end uses Web Speech API gracefully.
 */
export async function convertTextToSpeech(text: string): Promise<TTSResult> {
  const cleanedText = cleanTextForSpeech(text)
  if (!cleanedText) {
    return { success: false, useFallback: true, cleanedText: '', error: 'Empty text provided' }
  }

  const elevenLabsKey = process.env.ELEVENLABS_API_KEY
  const openaiKey = process.env.OPENAI_API_KEY
  const googleTtsKey = process.env.GOOGLE_TTS_API_KEY

  // 1. Try ElevenLabs TTS if key present
  if (elevenLabsKey) {
    try {
      const voiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM' // Default voice (Rachel)
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': elevenLabsKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: cleanedText,
          model_id: 'eleven_multilingual_v2', // Native Hinglish / multilingual support
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      })

      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer()
        return {
          success: true,
          audioBuffer: Buffer.from(arrayBuffer),
          mimeType: 'audio/mpeg',
          useFallback: false,
          cleanedText,
          provider: 'elevenlabs',
        }
      } else {
        console.warn('[TTS] ElevenLabs returned error status:', response.status)
      }
    } catch (err) {
      console.warn('[TTS] ElevenLabs request failed:', err)
    }
  }

  // 2. Try OpenAI TTS if key present
  if (openaiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: cleanedText,
          voice: 'nova', // clear, natural voice
          response_format: 'mp3',
        }),
      })

      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer()
        return {
          success: true,
          audioBuffer: Buffer.from(arrayBuffer),
          mimeType: 'audio/mpeg',
          useFallback: false,
          cleanedText,
          provider: 'openai',
        }
      } else {
        console.warn('[TTS] OpenAI TTS returned error status:', response.status)
      }
    } catch (err) {
      console.warn('[TTS] OpenAI TTS request failed:', err)
    }
  }

  // 3. Try Google Cloud TTS if key present
  if (googleTtsKey) {
    try {
      const response = await fetch(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${googleTtsKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: { text: cleanedText },
            voice: { languageCode: 'hi-IN', name: 'hi-IN-Wavenet-A' },
            audioConfig: { audioEncoding: 'MP3' },
          }),
        },
      )

      if (response.ok) {
        const json = await response.json()
        if (json.audioContent) {
          return {
            success: true,
            audioBuffer: Buffer.from(json.audioContent, 'base64'),
            mimeType: 'audio/mpeg',
            useFallback: false,
            cleanedText,
            provider: 'google',
          }
        }
      }
    } catch (err) {
      console.warn('[TTS] Google TTS request failed:', err)
    }
  }

  // 4. Default: No cloud TTS key configured or available -> use browser Web Speech API fallback
  return {
    success: true,
    useFallback: true,
    cleanedText,
    provider: 'fallback',
  }
}
