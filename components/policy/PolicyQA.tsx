'use client'

import React, { useState, useRef, useEffect, type Dispatch, type SetStateAction } from 'react'
import { createPortal } from 'react-dom'
import { ExtractedPage, AskResponseData, Citation, PolicyRule, PolicyStatus } from '@/lib/types/policy'
import type { HospitalBill, HospitalBillLineItem } from '@/lib/types/bill'
import { runBillAudit } from '@/lib/bill/auditor'
import { billContextText, billSummary } from '@/lib/bill/chatSummary'
import { BillCheckCard, type BillCheck } from './BillCheckCard'
import { FileText, X, AlertCircle, MessageCircle, Sparkles } from 'lucide-react'
import { FilePdf, Microphone, PaperPlaneRight, Paperclip, Receipt, SpeakerHigh, SpeakerSlash, Stop } from '@phosphor-icons/react'
import { SentenceSpeaker, canSpeak, getSpeechRecognition } from './voice'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  status?: PolicyStatus
  citations?: Citation[]
  confidence?: 'high' | 'medium' | 'low'
  isError?: boolean
  streaming?: boolean
  /** Shown next to the thinking dots while a slower job (reading a bill) runs. */
  pending?: string
  /** A bill the user attached to this message. */
  attachment?: { name: string; kind: 'image' | 'pdf'; previewUrl?: string }
  /** Result of checking an attached bill: the extracted charges and the deterministic audit. */
  bill?: BillCheck
}

/** Chat state lives in the parent so switching tabs does not unmount it away. */
export interface ChatState {
  messages: Message[]
  setMessages: Dispatch<SetStateAction<Message[]>>
  speak: boolean
  setSpeak: Dispatch<SetStateAction<boolean>>
  busy: boolean
  setBusy: Dispatch<SetStateAction<boolean>>
}

export function useChatState(): ChatState {
  const [messages, setMessages] = useState<Message[]>([])
  const [speak, setSpeak] = useState(false)
  const [busy, setBusy] = useState(false)
  return { messages, setMessages, speak, setSpeak, busy, setBusy }
}

interface PolicyQAProps {
  pages: ExtractedPage[]
  /** Saved analysis id. When set, the server reads the policy text from Supabase and the browser sends no pages. */
  planTemplateId?: string | null
  /** Policy rules, used by the bill check to judge each charge against the policy. */
  rules: PolicyRule[]
  chat: ChatState
  /** Opens the claim ledger with a bill read in this chat. */
  onAdjudicate?: (bill: HospitalBill) => void
}

type VoiceState = 'idle' | 'listening' | 'speaking'

const SUGGESTED_QUESTIONS = [
  'Does this policy cover maternity expenses?',
  'What is the waiting period for pre-existing diseases?',
  'Are there any room rent limits?',
  'What are the exclusions in this policy?',
  'Is dental treatment covered?',
  'What is the claim settlement process?',
]

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  covered: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  conditionally_covered: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  not_covered: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
  unclear: { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/30' },
}

export function PolicyQA({ pages, planTemplateId, rules, chat, onAdjudicate }: PolicyQAProps) {
  const { messages, setMessages, speak, setSpeak, busy, setBusy } = chat
  const [input, setInput] = useState('')
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null)
  const [voice, setVoice] = useState<VoiceState>('idle')
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [micOk, setMicOk] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const speakerRef = useRef<SentenceSpeaker | null>(null)
  const recRef = useRef<any>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  useEffect(() => {
    setMicOk(!!getSpeechRecognition())
    speakerRef.current = new SentenceSpeaker((speaking) => setVoice((v) => (speaking ? 'speaking' : v === 'speaking' ? 'idle' : v)))
    return () => {
      // Leaving the tab: stop listening and talking. The chat itself is kept by the parent.
      recRef.current?.abort?.()
      speakerRef.current?.cancel()
      speakerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!selectedCitation) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelectedCitation(null)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selectedCitation])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, busy])

  const patch = (id: string, change: Partial<Message> | ((m: Message) => Partial<Message>)) =>
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...(typeof change === 'function' ? change(m) : change) } : m)))

  const askQuestion = async (question: string, opts: { voice?: boolean } = {}) => {
    if (!question.trim() || busy) return
    const spoken = !!opts.voice || speak
    speakerRef.current?.cancel()

    const stamp = Date.now()
    const aiId = `ai-${stamp}`
    const history = messagesRef.current
      .filter((m) => !m.isError && !m.streaming)
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content }))

    setMessages((prev) => [
      ...prev,
      { id: `user-${stamp}`, role: 'user', content: question },
      { id: aiId, role: 'assistant', content: '', streaming: true },
    ])
    setInput('')
    setBusy(true)

    try {
      const send = (withPages: boolean) =>
        fetch('/api/policy/ask/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question,
            history,
            spoken: !!opts.voice,
            scenarioContext: latestBillContext(),
            ...(planTemplateId && !withPages ? { planTemplateId } : { pages }),
          }),
        })
      let res = await send(false)
      // The saved copy could not be read (database hiccup): retry once with the pages we already hold.
      if (!res.ok && planTemplateId) res = await send(true)
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null)
        throw new Error(j?.error || 'Failed to get an answer.')
      }

      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      let finished = false
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (!line) continue
          const evt = JSON.parse(line)
          if (evt.t === 'delta') {
            patch(aiId, (m) => ({ content: m.content + evt.text }))
            if (spoken) speakerRef.current?.push(evt.text)
          } else if (evt.t === 'done') {
            const data = evt.data as AskResponseData
            patch(aiId, {
              content: data.answer,
              status: data.status,
              citations: data.citations,
              confidence: data.confidence,
              streaming: false,
            })
            if (spoken) speakerRef.current?.flush()
            finished = true
          } else if (evt.t === 'error') {
            throw new Error(evt.error)
          }
        }
      }
      if (!finished) throw new Error('The answer was cut off. Please try again.')
    } catch (err: any) {
      speakerRef.current?.cancel()
      patch(aiId, { content: err.message || 'Something went wrong. Please try again.', isError: true, streaming: false })
    } finally {
      setBusy(false)
    }
  }

  const latestBillContext = (): string | undefined => {
    const b = [...messagesRef.current].reverse().find((m) => m.bill)?.bill
    return b ? billContextText(b.data, b.items, b.audit) : undefined
  }

  /** Reads an uploaded bill (PDF or photo) with the existing extraction, then runs the deterministic audit. */
  const checkBill = async (file: File) => {
    if (busy) return
    speakerRef.current?.cancel()
    const stamp = Date.now()
    const aiId = `bill-${stamp}`
    const isImage = file.type.startsWith('image/')
    setMessages((prev) => [
      ...prev,
      {
        id: `user-${stamp}`,
        role: 'user',
        content: 'Check this bill',
        attachment: { name: file.name, kind: isImage ? 'image' : 'pdf', previewUrl: isImage ? URL.createObjectURL(file) : undefined },
      },
      { id: aiId, role: 'assistant', content: '', streaming: true, pending: 'Reading your bill...' },
    ])
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/bill/analyze', { method: 'POST', body: fd })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) throw new Error(json?.error || 'I could not read that bill. Try a clearer photo or the PDF.')

      const parsed: HospitalBill = json.data
      if (!parsed.lineItems?.length) throw new Error('I could not find any charges in that file. Try a clearer photo or the PDF.')

      const audit = runBillAudit(parsed, parsed.lineItems, rules)
      const summary = billSummary(parsed, parsed.lineItems, audit)
      patch(aiId, { content: summary, streaming: false, pending: undefined, bill: { data: parsed, items: parsed.lineItems, audit } })
      if (speak) {
        speakerRef.current?.push(summary)
        speakerRef.current?.flush()
      }
    } catch (err: any) {
      patch(aiId, { content: err.message || 'Something went wrong reading the bill.', isError: true, streaming: false, pending: undefined })
    } finally {
      setBusy(false)
    }
  }

  /** The user fixed a misread amount or category: re-run the audit on the corrected charges. */
  const updateBillItems = (msgId: string, items: HospitalBillLineItem[]) =>
    patch(msgId, (m) => {
      if (!m.bill) return {}
      const audit = runBillAudit(m.bill.data, items, rules)
      return { bill: { ...m.bill, items, audit }, content: billSummary(m.bill.data, items, audit) }
    })

  const stopAll = () => {
    recRef.current?.abort?.()
    speakerRef.current?.cancel()
    setVoice('idle')
  }

  const startListening = () => {
    const SR = getSpeechRecognition()
    if (!SR) return
    setVoiceError(null)
    speakerRef.current?.cancel() // barge in: talking over the answer stops it

    const rec = new SR()
    rec.lang = 'en-IN'
    rec.interimResults = true
    rec.continuous = false
    rec.maxAlternatives = 1
    let finalText = ''
    let sent = false

    const send = () => {
      const t = finalText.trim()
      if (sent || !t) return
      sent = true
      setInput('')
      askQuestion(t, { voice: true })
    }

    rec.onresult = (e: any) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalText += r[0].transcript
        else interim += r[0].transcript
      }
      setInput((finalText + interim).trim())
      // Send the moment the final transcript lands instead of waiting for the session to close.
      if (finalText.trim() && e.results[e.results.length - 1].isFinal) {
        send()
        rec.stop()
      }
    }
    rec.onerror = (e: any) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setVoiceError('Microphone is blocked. Allow it in your browser settings.')
      } else if (e.error === 'no-speech') {
        setVoiceError('Did not catch that. Tap and try again.')
      } else if (e.error !== 'aborted') {
        setVoiceError('Voice input stopped. Tap to retry.')
      }
    }
    rec.onend = () => {
      recRef.current = null
      send()
      setVoice((v) => (v === 'listening' ? 'idle' : v))
    }

    recRef.current = rec
    try {
      rec.start()
      setVoice('listening')
    } catch {
      setVoice('idle')
    }
  }

  const onMic = () => {
    if (voice === 'listening' || voice === 'speaking') stopAll()
    else startListening()
  }

  const renderStatusBadge = (status?: PolicyStatus) => {
    if (!status) return null
    const colors = STATUS_COLORS[status] || STATUS_COLORS.unclear
    const label = status.replace(/_/g, ' ')
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider rounded-full border ${colors.bg} ${colors.text} ${colors.border}`}>
        {label}
      </span>
    )
  }

  const renderConfidence = (confidence?: 'high' | 'medium' | 'low') => {
    if (!confidence || confidence === 'high') return null
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
        <AlertCircle className="w-3 h-3" />
        {confidence} confidence
      </span>
    )
  }

  const status =
    voice === 'listening' ? 'Listening...' : busy ? 'Thinking...' : voice === 'speaking' ? 'Speaking. Tap to stop.' : voiceError

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] min-h-[500px] relative">
      {/* Chat messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-5">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
              <MessageCircle className="w-8 h-8 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[var(--text)] mb-1">Ask your policy</h3>
              <p className="text-sm text-slate-500 max-w-sm">
                {micOk ? 'Type, or tap the mic and just ask.' : 'Answers come with the page they are from.'}
              </p>
            </div>
            <button type="button" className="sx-bill-cta" onClick={() => fileRef.current?.click()}>
              <Receipt size={24} weight="bold" aria-hidden />
              <span>
                <strong>Check a hospital bill</strong>
                <small>Upload a photo or PDF</small>
              </span>
            </button>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => askQuestion(q)}
                  className="group text-left bg-[var(--card)] hover:bg-[var(--card2)] border border-[var(--border)] hover:border-emerald-500/30 text-sm text-slate-400 hover:text-emerald-400 py-3 px-4 rounded-xl transition-all duration-200"
                >
                  <span className="line-clamp-2">{q}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            if (msg.role === 'assistant' && msg.streaming && !msg.content) {
              return (
                <div key={msg.id} className="flex justify-start">
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5" aria-label="Thinking">
                    <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                    <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                    {msg.pending && <span className="text-sm text-slate-400 ml-1">{msg.pending}</span>}
                  </div>
                </div>
              )
            }
            return (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={msg.bill ? 'w-full max-w-[640px]' : 'max-w-[80%]'}>
                  {msg.role === 'assistant' && (
                    <div className="flex items-center gap-1.5 mb-1.5 ml-1">
                      <Sparkles className="w-3 h-3 text-emerald-400" />
                      <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Policy AI</span>
                    </div>
                  )}

                  <div
                    className={`rounded-2xl px-4 py-3 ${
                      msg.role === 'user'
                        ? 'bg-[var(--brand)] text-[var(--on-brand)] rounded-br-sm'
                        : msg.isError
                          ? 'bg-red-500/10 border border-red-500/20 text-red-400 rounded-bl-sm'
                          : 'bg-[var(--card)] border border-[var(--border)] text-[var(--text)] rounded-bl-sm'
                    }`}
                  >
                    {msg.role === 'assistant' && !msg.isError && !msg.streaming && (
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        {renderStatusBadge(msg.status)}
                        {renderConfidence(msg.confidence)}
                      </div>
                    )}

                    {msg.attachment && (
                      <div className="sx-attach-chip">
                        {msg.attachment.previewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={msg.attachment.previewUrl} alt="Bill you uploaded" />
                        ) : (
                          <FilePdf size={26} weight="duotone" aria-hidden />
                        )}
                        <span>{msg.attachment.name}</span>
                      </div>
                    )}
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>

                    {msg.bill && <BillCheckCard
                        check={msg.bill}
                        onItemsChange={(items) => updateBillItems(msg.id, items)}
                        onAdjudicate={onAdjudicate ? () => onAdjudicate({ ...msg.bill!.data, lineItems: msg.bill!.items }) : undefined}
                      />}

                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-[var(--border)]">
                        <p className="text-[11px] font-semibold text-slate-500 mb-2 uppercase tracking-wider">Evidence</p>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.citations.map((cit, idx) => (
                            <button
                              key={idx}
                              onClick={() => setSelectedCitation(cit)}
                              className="flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 text-xs px-2.5 py-1 rounded-lg transition-colors"
                            >
                              <FileText className="w-3 h-3" />
                              Page {cit.page_number} · {cit.section_name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Input area */}
      <div className="p-4 border-t border-[var(--border)] bg-[var(--surface)]">
        <div className="sx-voice-status" role="status" aria-live="polite" data-state={voice === 'listening' ? 'listening' : busy ? 'busy' : voiceError ? 'error' : 'idle'}>
          {status}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            askQuestion(input)
          }}
          className="flex gap-2 items-center"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={voice === 'listening' ? 'Listening...' : 'Ask your policy...'}
            disabled={busy}
            className="flex-1 min-w-0 bg-[var(--card)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text)] placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 disabled:opacity-50 transition-colors"
          />
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) checkBill(f)
            }}
          />
          <button
            type="button"
            className="sx-voice-toggle"
            aria-label="Attach a hospital bill (photo or PDF)"
            title="Attach a bill"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip size={22} weight="bold" aria-hidden />
          </button>
          {canSpeak() && (
            <button
              type="button"
              className="sx-voice-toggle"
              aria-pressed={speak}
              aria-label={speak ? 'Stop reading answers aloud' : 'Read answers aloud'}
              title={speak ? 'Answers are read aloud' : 'Read answers aloud'}
              onClick={() => {
                if (speak) speakerRef.current?.cancel()
                setSpeak((s) => !s)
              }}
            >
              {speak ? <SpeakerHigh size={22} weight="bold" aria-hidden /> : <SpeakerSlash size={22} weight="bold" aria-hidden />}
            </button>
          )}
          {micOk && (
            <button
              type="button"
              className="sx-mic"
              data-state={voice}
              aria-label={voice === 'idle' ? 'Ask by voice' : 'Stop'}
              onClick={onMic}
              disabled={busy && voice === 'idle'}
            >
              {voice === 'idle' ? <Microphone size={24} weight="fill" aria-hidden /> : <Stop size={22} weight="fill" aria-hidden />}
            </button>
          )}
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Send"
            className="bg-[var(--brand)] hover:bg-[var(--brand-hi)] text-[var(--on-brand)] rounded-xl px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <PaperPlaneRight size={20} weight="bold" aria-hidden />
          </button>
        </form>
      </div>

      {/* Evidence Panel Modal */}
      {/* Portalled to <body> so it sits above the bottom bar (the page column is its own stacking context). */}
      {selectedCitation &&
        typeof document !== 'undefined' &&
        createPortal(
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 z-[70]"
          onClick={() => setSelectedCitation(null)}
        >
          <div
            className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h3 className="font-semibold text-[var(--text)] flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-400" />
                Evidence Source
              </h3>
              <button
                onClick={() => setSelectedCitation(null)}
                aria-label="Close"
                className="text-slate-500 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-3 text-sm bg-emerald-500/10 border border-emerald-500/20 px-3 py-2.5 rounded-xl">
                <span className="font-semibold text-emerald-400">Page {selectedCitation.page_number}</span>
                {selectedCitation.section_name && (
                  <>
                    <span className="text-emerald-700">·</span>
                    <span className="text-emerald-300">{selectedCitation.section_name}</span>
                  </>
                )}
              </div>
              <div className="pl-1">
                <p className="text-sm text-[var(--muted)] leading-relaxed italic">
                  &ldquo;{selectedCitation.evidence_text}&rdquo;
                </p>
              </div>
            </div>
          </div>
        </div>
      ,
        document.body,
      )}
    </div>
  )
}
