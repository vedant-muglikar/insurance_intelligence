'use client'

/** Browser speech helpers: no server round trip for either direction, which keeps voice latency low. */

export function getSpeechRecognition(): any | null {
  if (typeof window === 'undefined') return null
  const w = window as any
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null
  const rank = (v: SpeechSynthesisVoice) =>
    (v.lang === 'en-IN' ? 0 : v.lang.startsWith('en-') ? 1 : 5) + (v.localService ? 0 : 0.5) + (/natural|google/i.test(v.name) ? -0.2 : 0)
  return [...voices].sort((a, b) => rank(a) - rank(b))[0]
}

/**
 * Speaks text as it streams in, one sentence at a time, so audio starts after the first sentence
 * is generated instead of after the whole answer.
 */
export class SentenceSpeaker {
  private buf = ''
  private pending = 0
  private voice: SpeechSynthesisVoice | null = null

  constructor(private onSpeaking: (speaking: boolean) => void) {
    if (canSpeak()) {
      this.voice = pickVoice()
      window.speechSynthesis.onvoiceschanged = () => {
        this.voice = pickVoice()
      }
    }
  }

  push(text: string) {
    if (!canSpeak()) return
    this.buf += text
    for (;;) {
      const m = /^([\s\S]*?[.!?।](?:["')\]]*))(\s|$)/.exec(this.buf)
      let cut = m ? m[1].length : -1
      // A very long run without a full stop: break at the last comma so speech is not held back.
      if (cut < 0 && this.buf.length > 110) cut = Math.max(this.buf.lastIndexOf(', '), this.buf.lastIndexOf(' '))
      if (cut <= 0) break
      this.say(this.buf.slice(0, cut + (m ? 0 : 1)))
      this.buf = this.buf.slice(cut + (m ? 0 : 1)).trimStart()
    }
  }

  flush() {
    if (this.buf.trim()) this.say(this.buf)
    this.buf = ''
  }

  cancel() {
    this.buf = ''
    this.pending = 0
    if (canSpeak()) window.speechSynthesis.cancel()
    this.onSpeaking(false)
  }

  private say(text: string) {
    const clean = text.replace(/[*_#`>]/g, '').trim()
    if (!clean) return
    const u = new SpeechSynthesisUtterance(clean)
    if (this.voice) {
      u.voice = this.voice
      u.lang = this.voice.lang
    } else {
      u.lang = 'en-IN'
    }
    u.rate = 1.05
    const done = () => {
      this.pending = Math.max(0, this.pending - 1)
      if (this.pending === 0) this.onSpeaking(false)
    }
    u.onend = done
    u.onerror = done
    this.pending++
    this.onSpeaking(true)
    window.speechSynthesis.speak(u)
  }
}
