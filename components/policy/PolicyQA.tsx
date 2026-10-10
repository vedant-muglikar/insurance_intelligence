'use client'

import React, { useState, useRef, useEffect } from 'react'
import { ExtractedPage, AskResponseData, Citation, PolicyStatus } from '@/lib/types/policy'
import { Send, FileText, X, AlertCircle, MessageCircle, Sparkles } from 'lucide-react'

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
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isLoading])

  const askQuestion = async (question: string) => {
    if (!question.trim() || isLoading) return

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
    }

    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    try {
      const history = messages
        .filter((m) => !m.isError)
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }))

      const res = await fetch('/api/policy/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, pages, history }),
      })
      const result = await res.json()

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to get an answer.')
      }

      const data = result.data as AskResponseData
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          content: data.answer,
          status: data.status,
          citations: data.citations,
          confidence: data.confidence,
        },
      ])
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
                Get instant, AI-powered answers backed by direct citations from your uploaded policy document.
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
              <div className={`max-w-[80%] ${msg.role === 'user' ? '' : ''}`}>
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-1.5 mb-1.5 ml-1">
                    <Sparkles className="w-3 h-3 text-emerald-400" />
                    <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Policy AI</span>
                  </div>
                )}

                <div className={`rounded-2xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-[var(--brand)] text-[var(--on-brand)] rounded-br-sm'
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
          ))
        )}

        {/* Loading indicator */}
        {isLoading && (
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

      {/* Input area */}
      <div className="p-4 border-t border-[var(--border)] bg-[var(--surface)]">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            askQuestion(input)
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything about your policy..."
            disabled={isLoading}
            className="flex-1 bg-[var(--card)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text)] placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 disabled:opacity-50 transition-colors"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-[var(--brand)] hover:bg-[var(--brand-hi)] text-[var(--on-brand)] rounded-xl px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
              <div className="pl-1">
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
