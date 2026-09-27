'use client'

import React, { useState } from 'react'
import { ExtractedPage, AskResponseData, Citation } from '@/lib/types/policy'
import { Send, FileText, X, AlertCircle } from 'lucide-react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  status?: string
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
]

export function PolicyQA({ pages }: PolicyQAProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null)

  const askQuestion = async (question: string) => {
    if (!question.trim()) return

    const newMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: question,
    }

    setMessages((prev) => [...prev, newMessage])
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
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
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
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: err.message || 'An error occurred while answering.',
          isError: true,
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const renderStatus = (status?: string) => {
    if (!status) return null
    const colors: Record<string, string> = {
      covered: 'bg-green-100 text-green-800 border-green-200',
      conditionally_covered: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      not_covered: 'bg-red-100 text-red-800 border-red-200',
      unclear: 'bg-gray-100 text-gray-800 border-gray-200',
    }
    const colorClass = colors[status] || colors.unclear
    return (
      <span className={`px-2 py-1 text-xs font-medium border rounded-full ${colorClass}`}>
        {status.replace('_', ' ').toUpperCase()}
      </span>
    )
  }

  return (
    <div className="flex flex-col h-[600px] border rounded-xl overflow-hidden bg-white shadow-sm relative">
      <div className="p-4 bg-gray-50 border-b">
        <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-600" />
          Ask About Your Policy
        </h2>
        <p className="text-sm text-gray-500 mt-1">Get instant answers backed by citations from your document.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 space-y-4">
            <p>Ask anything about your coverage, limits, or exclusions.</p>
            <div className="flex flex-wrap justify-center gap-2 max-w-lg">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => askQuestion(q)}
                  className="bg-gray-100 hover:bg-blue-50 text-gray-700 hover:text-blue-700 text-sm py-2 px-4 rounded-full transition-colors border border-gray-200 hover:border-blue-300"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-100 text-gray-800 rounded-bl-none'}`}>
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-2 mb-2">
                    {renderStatus(msg.status)}
                    {msg.confidence && msg.confidence !== 'high' && (
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {msg.confidence} confidence
                      </span>
                    )}
                  </div>
                )}
                
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                
                {msg.citations && msg.citations.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Citations</p>
                    <div className="flex flex-wrap gap-2">
                      {msg.citations.map((cit, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSelectedCitation(cit)}
                          className="flex items-center gap-1 bg-white hover:bg-gray-50 border border-gray-200 text-xs px-2 py-1 rounded shadow-sm transition-colors text-blue-600"
                        >
                          <FileText className="w-3 h-3" />
                          Pg {cit.page_number}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-800 rounded-2xl rounded-bl-none px-4 py-3 flex items-center gap-2">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-75" />
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-150" />
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t bg-white">
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
            placeholder="Ask a question..."
            disabled={isLoading}
            className="flex-1 border rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-2 w-10 h-10 flex items-center justify-center disabled:opacity-50 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* Evidence Panel Modal */}
      {selectedCitation && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-full">
            <div className="flex items-center justify-between p-4 border-b bg-gray-50">
              <h3 className="font-semibold text-gray-800">Evidence Source</h3>
              <button onClick={() => setSelectedCitation(null)} className="text-gray-500 hover:text-gray-800 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto">
              <div className="flex items-center gap-2 mb-3 text-sm text-gray-600 bg-blue-50 px-3 py-2 rounded-lg">
                <span className="font-medium text-blue-800">Page {selectedCitation.page_number}</span>
                {selectedCitation.section_name && (
                  <>
                    <span className="text-blue-300">•</span>
                    <span className="text-blue-700">{selectedCitation.section_name}</span>
                  </>
                )}
              </div>
              <p className="text-sm text-gray-700 leading-relaxed italic border-l-4 border-blue-400 pl-3 bg-gray-50/50 p-2 rounded-r-lg">
                "{selectedCitation.evidence_text}"
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
