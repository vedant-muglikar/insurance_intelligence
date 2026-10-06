'use client'

import React, { useState, useRef, useEffect } from 'react'
import { ExtractedPage, AskResponseData, Citation, PolicyStatus } from '@/lib/types/policy'
import {
  Send,
  FileText,
  X,
  AlertCircle,
  MessageCircle,
  Sparkles,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Loader2,
} from 'lucide-react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  status?: PolicyStatus
  citations?: Citation[]
  confidence?: 'high' | 'medium' | 'low'
  isError?: boolean
}

interface PolicyQAProps {
  pages: ExtractedPage[]
}

const SUGGESTED_QUESTIONS = [
  "Does this policy cover maternity expenses?",
  "What is the waiting period for pre-existing diseases?",
  "Are there any room rent limits?",
  "What are the exclusions in this policy?",
  "Is dental treatment covered?",
  "What is the claim settlement process?",
]

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  covered: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  conditionally_covered: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  not_covered: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
  unclear: { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/30' },
}

export function PolicyQA({ pages }: PolicyQAProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null)

  // Speech-To-Text (STT) State
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessingSpeech, setIsProcessingSpeech] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  // Text-To-Speech (TTS) State
  const [activeSpeakingId, setActiveSpeakingId] = useState<string | null>(null)
  const [autoReadAnswers, setAutoReadAnswers] = useState<boolean>(false)
  const currentAudioRef = useRef<HTMLAudioElement | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isLoading, isProcessingSpeech])

  // Clean up audio playback on unmount
  useEffect(() => {
    return () => {
      stopAudio()
    }
  }, [])

  const stopAudio = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current = null
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    setActiveSpeakingId(null)
  }

  // Speak text using TTS API with browser fallback
  const speakMessage = async (msgId: string, text: string) => {
    if (activeSpeakingId === msgId) {
      stopAudio()
      return
    }

    stopAudio()
    setActiveSpeakingId(msgId)

    try {
      // 1. Call server TTS API
      const res = await fetch('/api/policy/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const result = await res.json()

      // If server returned cloud audio (ElevenLabs / OpenAI / Google key present)
      if (result.success && !result.useFallback && result.audioBase64) {
        const audio = new Audio(`data:${result.mimeType || 'audio/mpeg'};base64,${result.audioBase64}`)
        currentAudioRef.current = audio

        audio.onended = () => {
          setActiveSpeakingId(null)
          currentAudioRef.current = null
        }
        audio.onerror = () => {
          fallbackSpeech(result.cleanedText || text, msgId)
        }

        await audio.play()
        return
      }

      // If server instructed fallback or key not present, use browser Web Speech API
      const textToSpeak = result.cleanedText || text
      fallbackSpeech(textToSpeak, msgId)
    } catch (err) {
      console.warn('[TTS] API error, falling back to Web Speech API:', err)
      fallbackSpeech(text, msgId)
    }
  }

  // Web Speech API fallback for Text-to-Speech
  const fallbackSpeech = (text: string, msgId: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setActiveSpeakingId(null)
      return
    }

    window.speechSynthesis.cancel()
    const cleaned = text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\[PAGE\s*\d+\]/gi, '')
      .replace(/#+/g, '')

    const utterance = new SpeechSynthesisUtterance(cleaned)

    // Detect Hinglish / Indian accent voices if available
    const voices = window.speechSynthesis.getVoices()
    const indianVoice = voices.find(
      (v) => v.lang.includes('hi-IN') || v.lang.includes('en-IN') || v.name.includes('India'),
    )
    if (indianVoice) {
      utterance.voice = indianVoice
    } else {
      utterance.lang = 'en-IN'
    }

    utterance.rate = 1.0
    utterance.pitch = 1.0

    utterance.onend = () => setActiveSpeakingId(null)
    utterance.onerror = () => setActiveSpeakingId(null)

    window.speechSynthesis.speak(utterance)
  }

  const askQuestion = async (question: string) => {
    if (!question.trim() || isLoading) return

    stopAudio()
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
    }

    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    try {
      const res = await fetch('/api/policy/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, pages }),
      })
      const result = await res.json()

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to get an answer.')
      }

      const data = result.data as AskResponseData
      const newMsgId = `ai-${Date.now()}`
      const newAiMsg: Message = {
        id: newMsgId,
        role: 'assistant',
        content: data.answer,
        status: data.status,
        citations: data.citations,
        confidence: data.confidence,
      }

      setMessages((prev) => [...prev, newAiMsg])

      // Auto-read answer if enabled
      if (autoReadAnswers) {
        setTimeout(() => speakMessage(newMsgId, data.answer), 300)
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: err.message || 'Something went wrong. Please try again.',
          isError: true,
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  // Start Voice Recording (Speech to Text)
  const startRecording = async () => {
    stopAudio()
    audioChunksRef.current = []

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        // Stop media tracks
        stream.getTracks().forEach((track) => track.stop())

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        if (audioBlob.size < 100) return

        setIsProcessingSpeech(true)
        await sendAudioToSTT(audioBlob)
        setIsProcessingSpeech(false)
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (err) {
      console.warn('[STT] MediaRecorder error, attempting Web Speech API fallback:', err)
      fallbackBrowserSpeechRecognition()
    }
  }

  // Stop Voice Recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  // Send Audio Blob to Server STT API -> Automatically queries Chatbot Framework
  const sendAudioToSTT = async (blob: Blob) => {
    try {
      const formData = new FormData()
      formData.append('audio', blob, 'recording.webm')
      formData.append('pages', JSON.stringify(pages))
      formData.append('autoAsk', 'true')

      const res = await fetch('/api/policy/stt', {
        method: 'POST',
        body: formData,
      })
      const result = await res.json()

      if (!result.success || !result.transcript) {
        throw new Error(result.error || 'Speech recognition failed.')
      }

      const userTranscript = result.transcript
      const userMsgId = `user-${Date.now()}`
      const userMsg: Message = {
        id: userMsgId,
        role: 'user',
        content: userTranscript,
      }

      if (result.data) {
        // STT API already queried the LLM chatbot framework and returned answer!
        const data = result.data as AskResponseData
        const aiMsgId = `ai-${Date.now()}`
        const aiMsg: Message = {
          id: aiMsgId,
          role: 'assistant',
          content: data.answer,
          status: data.status,
          citations: data.citations,
          confidence: data.confidence,
        }

        setMessages((prev) => [...prev, userMsg, aiMsg])

        if (autoReadAnswers) {
          setTimeout(() => speakMessage(aiMsgId, data.answer), 300)
        }
      } else {
        // If STT returned transcript without autoAsk, pass to askQuestion
        setMessages((prev) => [...prev, userMsg])
        await askQuestion(userTranscript)
      }
    } catch (err: any) {
      console.warn('[STT] Server transcription failed, using web speech fallback:', err)
      fallbackBrowserSpeechRecognition()
    }
  }

  // Web Speech API fallback for Speech-to-Text
  const fallbackBrowserSpeechRecognition = () => {
    if (typeof window === 'undefined') return

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser. Please type your question.')
      setIsRecording(false)
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    // Set Hinglish / Indian English / Hindi language mode
    recognition.lang = 'hi-IN'

    recognition.onstart = () => setIsRecording(true)
    recognition.onend = () => setIsRecording(false)
    recognition.onerror = () => setIsRecording(false)

    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript
      if (transcript) {
        askQuestion(transcript)
      }
    }

    recognition.start()
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

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] min-h-[500px] relative">
      {/* Top Header Controls (Auto Read Toggle & Voice Mode Info) */}
      <div className="px-4 py-2 bg-[var(--surface)] border-b border-[var(--border)] flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">
            <Mic className="w-3 h-3" /> Voice & Hinglish Enabled
          </span>
        </div>

        <button
          onClick={() => {
            setAutoReadAnswers(!autoReadAnswers)
            if (!autoReadAnswers) stopAudio()
          }}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors ${
            autoReadAnswers
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              : 'bg-[var(--card)] text-slate-400 border-[var(--border)] hover:text-slate-200'
          }`}
          title="Automatically speak AI responses"
        >
          {autoReadAnswers ? <Volume2 className="w-3.5 h-3.5 text-emerald-400" /> : <VolumeX className="w-3.5 h-3.5" />}
          <span>Auto Read Answers</span>
        </button>
      </div>

      {/* Chat messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-5">
        {messages.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
              <MessageCircle className="w-8 h-8 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[var(--text)] mb-1">Ask about your policy</h3>
              <p className="text-sm text-slate-500 max-w-sm">
                Get instant, AI-powered answers by typing or speaking in Hinglish, English, or Hindi.
              </p>
            </div>
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
          /* Chat messages */
          messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[80%]">
                {msg.role === 'assistant' && (
                  <div className="flex items-center justify-between mb-1.5 ml-1">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-emerald-400" />
                      <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Policy AI</span>
                    </div>

                    {!msg.isError && (
                      <button
                        onClick={() => speakMessage(msg.id, msg.content)}
                        className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md transition-colors ${
                          activeSpeakingId === msg.id
                            ? 'bg-emerald-500/20 text-emerald-300 font-semibold'
                            : 'text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10'
                        }`}
                        title="Read answer aloud"
                      >
                        {activeSpeakingId === msg.id ? (
                          <>
                            <VolumeX className="w-3 h-3 text-emerald-400 animate-pulse" />
                            <span>Stop Speaking</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-3 h-3" />
                            <span>Read Aloud</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}

                <div className={`rounded-2xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-emerald-600 text-white rounded-br-sm'
                    : msg.isError
                      ? 'bg-red-500/10 border border-red-500/20 text-red-400 rounded-bl-sm'
                      : 'bg-[var(--card)] border border-[var(--border)] text-[var(--text)] rounded-bl-sm'
                }`}>
                  {/* Status + confidence badges for assistant */}
                  {msg.role === 'assistant' && !msg.isError && (
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      {renderStatusBadge(msg.status)}
                      {renderConfidence(msg.confidence)}
                    </div>
                  )}

                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>

                  {/* Citations */}
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-[var(--border)]">
                      <p className="text-[10px] font-semibold text-slate-500 mb-2 uppercase tracking-wider">Evidence</p>
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
          ))
        )}

        {/* Processing Speech Indicator */}
        {isProcessingSpeech && (
          <div className="flex justify-start">
            <div className="bg-[var(--card)] border border-emerald-500/30 rounded-2xl px-4 py-3 flex items-center gap-2 text-emerald-400 text-xs font-medium">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
              <span>Transcribing speech in Hinglish & processing with Policy AI...</span>
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {isLoading && !isProcessingSpeech && (
          <div className="flex justify-start">
            <div>
              <div className="flex items-center gap-1.5 mb-1.5 ml-1">
                <Sparkles className="w-3 h-3 text-emerald-400 animate-pulse" />
                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Analyzing policy...</span>
              </div>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Recording status bar */}
      {isRecording && (
        <div className="bg-red-500/10 border-t border-red-500/20 px-4 py-2 flex items-center justify-between text-xs text-red-400 animate-pulse">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            <span className="font-semibold">Recording... Speak your question in Hinglish, English, or Hindi</span>
          </div>
          <button
            onClick={stopRecording}
            className="px-2.5 py-1 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors"
          >
            Done / Send
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="p-4 border-t border-[var(--border)] bg-[var(--surface)]">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            askQuestion(input)
          }}
          className="flex gap-2"
        >
          {/* Mic Button */}
          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isLoading || isProcessingSpeech}
            className={`p-2.5 rounded-xl border flex items-center justify-center transition-all ${
              isRecording
                ? 'bg-red-500 text-white border-red-400 shadow-lg shadow-red-500/30 animate-pulse'
                : 'bg-[var(--card)] text-slate-300 border-[var(--border)] hover:text-emerald-400 hover:border-emerald-500/30'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
            title={isRecording ? 'Stop recording' : 'Speak question (Hinglish/English)'}
          >
            {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything or click mic to speak..."
            disabled={isLoading || isRecording || isProcessingSpeech}
            className="flex-1 bg-[var(--card)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text)] placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 disabled:opacity-50 transition-colors"
          />

          <button
            type="submit"
            disabled={isLoading || !input.trim() || isRecording || isProcessingSpeech}
            className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* Evidence Panel Modal */}
      {selectedCitation && (
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 z-50"
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
              <div className="border-l-2 border-emerald-500/40 pl-3">
                <p className="text-sm text-[var(--muted)] leading-relaxed italic">
                  &ldquo;{selectedCitation.evidence_text}&rdquo;
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
