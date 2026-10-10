/**
 * Browser-side upload for /api/policy/analyze with live progress.
 *
 * Uses XMLHttpRequest (fetch has no upload progress) and parses the NDJSON
 * progress stream incrementally as it arrives.
 */

import type {
  AnalysisProgressEvent,
  AnalysisStage,
  PageExtractionMethod,
  PageOcrQuality,
  PolicyAnalysisResult,
} from '@/lib/types/policy'

export interface PageProgress {
  page_number: number
  method: PageExtractionMethod
  status: 'detected' | 'ocr_started' | 'ocr_done' | 'done'
  reason?: string
  ocr_confidence?: number
  ocr_quality?: PageOcrQuality
  needs_clearer_scan?: boolean
  warnings?: string[]
  preview?: string
}

export interface AnalysisProgressState {
  phase: 'uploading' | 'processing'
  uploadPct: number
  stage: AnalysisStage | null
  /** Stages the server has reported so far, in order */
  seenStages: AnalysisStage[]
  message: string
  /** Server-side progress 0–100 */
  progress: number
  totalPages: number
  pages: Record<number, PageProgress>
}

export const INITIAL_PROGRESS: AnalysisProgressState = {
  phase: 'uploading',
  uploadPct: 0,
  stage: null,
  seenStages: [],
  message: 'Uploading document…',
  progress: 0,
  totalPages: 0,
  pages: {},
}

export function applyProgressEvent(
  state: AnalysisProgressState,
  event: AnalysisProgressEvent,
): AnalysisProgressState {
  if (event.type === 'stage') {
    return {
      ...state,
      phase: 'processing',
      uploadPct: 100,
      stage: event.stage,
      seenStages: state.seenStages.includes(event.stage) ? state.seenStages : [...state.seenStages, event.stage],
      message: event.message,
      progress: Math.max(state.progress, event.progress),
    }
  }
  if (event.type === 'page') {
    const prev = state.pages[event.page_number]
    return {
      ...state,
      totalPages: event.total_pages,
      pages: {
        ...state.pages,
        [event.page_number]: {
          ...prev,
          page_number: event.page_number,
          method: event.method,
          status: event.status,
          reason: event.reason ?? prev?.reason,
          ocr_confidence: event.ocr_confidence ?? prev?.ocr_confidence,
          ocr_quality: event.ocr_quality ?? prev?.ocr_quality,
          needs_clearer_scan: event.needs_clearer_scan ?? prev?.needs_clearer_scan,
          warnings: event.warnings ?? prev?.warnings,
          preview: event.preview ?? prev?.preview,
        },
      },
    }
  }
  return state
}

export class AnalysisCancelledError extends Error {
  constructor() {
    super('Analysis cancelled.')
    this.name = 'AnalysisCancelledError'
  }
}

/** Generous client-side ceiling; the server enforces its own OCR/AI budgets */
const CLIENT_TIMEOUT_MS = 6 * 60 * 1000

export function analyzePolicyUpload(
  file: File,
  onEvent: (event: AnalysisProgressEvent | { type: 'upload'; pct: number }) => void,
): { promise: Promise<PolicyAnalysisResult>; abort: () => void } {
  const xhr = new XMLHttpRequest()

  const promise = new Promise<PolicyAnalysisResult>((resolve, reject) => {
    let consumed = 0
    let result: PolicyAnalysisResult | null = null
    let streamError: string | null = null

    const consume = (final: boolean) => {
      const text = xhr.responseText
      const end = final ? text.length : text.lastIndexOf('\n') + 1
      if (end <= consumed) return
      const chunk = text.slice(consumed, end)
      consumed = end
      for (const raw of chunk.split('\n')) {
        const line = raw.trim()
        if (!line) continue
        let event: AnalysisProgressEvent
        try {
          event = JSON.parse(line)
        } catch {
          continue
        }
        if (event.type === 'result') result = event.data
        else if (event.type === 'error') streamError = event.error
        else onEvent(event)
      }
    }

    xhr.open('POST', '/api/policy/analyze?stream=1')
    xhr.timeout = CLIENT_TIMEOUT_MS
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onEvent({ type: 'upload', pct: Math.round((e.loaded / e.total) * 100) })
    }
    xhr.upload.onload = () => onEvent({ type: 'upload', pct: 100 })
    xhr.onprogress = () => {
      if (xhr.status === 200) consume(false)
    }
    xhr.onload = () => {
      if (xhr.status !== 200) {
        // Validation/auth errors arrive as a plain JSON body
        let message = `Server error: ${xhr.status}`
        try {
          message = JSON.parse(xhr.responseText).error || message
        } catch {
          /* non-JSON body */
        }
        reject(new Error(message))
        return
      }
      consume(true)
      if (result) resolve(result)
      else reject(new Error(streamError || 'The connection closed before the analysis finished. Please try again.'))
    }
    xhr.onerror = () => reject(new Error('Network error while uploading the document. Check your connection and try again.'))
    xhr.ontimeout = () => reject(new Error('The analysis took too long and was stopped. Try a smaller PDF or a clearer scan.'))
    xhr.onabort = () => reject(new AnalysisCancelledError())

    const form = new FormData()
    form.append('file', file)
    xhr.send(form)
  })

  return { promise, abort: () => xhr.abort() }
}
