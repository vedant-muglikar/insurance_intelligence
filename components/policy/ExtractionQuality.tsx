'use client'

import { Fragment, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, FileText, ScanLine } from 'lucide-react'
import type { ExtractedPage, ExtractionReport, PageExtractionMethod } from '@/lib/types/policy'

const METHOD_STYLE: Record<PageExtractionMethod, { label: string; cls: string }> = {
  text_layer: { label: 'Text', cls: 'bg-emerald-950 text-emerald-300 border-emerald-800' },
  ocr: { label: 'OCR', cls: 'bg-cyan-950 text-cyan-300 border-cyan-800' },
  hybrid: { label: 'Text + OCR', cls: 'bg-violet-950 text-violet-300 border-violet-800' },
  failed: { label: 'Unreadable', cls: 'bg-red-950 text-red-300 border-red-800' },
}

function confidenceTone(conf?: number) {
  if (conf === undefined) return 'text-slate-500'
  if (conf >= 85) return 'text-emerald-400'
  if (conf >= 70) return 'text-amber-300'
  return 'text-red-400'
}

/**
 * Per-page extraction report: which pages used the embedded text layer vs OCR,
 * OCR confidence, pages needing a clearer scan, ambiguous amounts, and the
 * extracted text of each page for verification.
 */
export function ExtractionQuality({ report, pages }: { report: ExtractionReport; pages: ExtractedPage[] }) {
  const usedOcr = report.ocr_engine !== null
  const hasProblems = report.pages_needing_rescan.length > 0 || report.pages_with_ambiguous_amounts.length > 0
  const [open, setOpen] = useState(hasProblems)
  const [previewPage, setPreviewPage] = useState<number | null>(null)
  const pageText = new Map(pages.map((p) => [p.page_number, p]))

  const ambiguous = pages
    .filter((p) => (p.ocr?.ambiguous_amounts.length ?? 0) > 0 && p.extraction_method !== 'text_layer')
    .map((p) => ({ page: p.page_number, values: p.ocr!.ambiguous_amounts }))

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="icon-box tone-blue shrink-0">
            {usedOcr ? <ScanLine size={15} /> : <FileText size={15} />}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white">Document extraction</div>
            <div className="text-xs text-slate-400 truncate">
              {report.text_layer_pages} text page{report.text_layer_pages === 1 ? '' : 's'}
              {report.ocr_pages > 0 && ` · ${report.ocr_pages} scanned (OCR)`}
              {report.hybrid_pages > 0 && ` · ${report.hybrid_pages} text + OCR`}
              {report.failed_pages > 0 && ` · ${report.failed_pages} unreadable`}
              {report.average_ocr_confidence !== null && ` · avg OCR confidence ${report.average_ocr_confidence}%`}
            </div>
          </div>
        </div>
        {open ? <ChevronDown size={15} className="text-slate-500 shrink-0" /> : <ChevronRight size={15} className="text-slate-500 shrink-0" />}
      </button>

      {report.pages_needing_rescan.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-950/40 border border-amber-800/60 text-xs text-amber-100">
          <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-400" />
          <div>
            <div className="font-semibold">
              Page{report.pages_needing_rescan.length > 1 ? 's' : ''} {report.pages_needing_rescan.join(', ')} need
              {report.pages_needing_rescan.length > 1 ? '' : 's'} a clearer scan
            </div>
            <p className="mt-0.5 text-amber-200/80">
              Text on {report.pages_needing_rescan.length > 1 ? 'these pages' : 'this page'} could not be read reliably, so
              terms from {report.pages_needing_rescan.length > 1 ? 'them' : 'it'} may be missing or marked uncertain. Rescan at
              300 DPI or higher (flat, well-lit) and upload again for complete results.
            </p>
          </div>
        </div>
      )}

      {ambiguous.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-950/70 border border-slate-800 text-xs text-slate-300">
          <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-400" />
          <div className="space-y-1">
            <div className="font-semibold text-slate-200">Amounts OCR could not read reliably (not auto-corrected)</div>
            {ambiguous.map((a) => (
              <div key={a.page} className="font-mono text-[11px]">
                Page {a.page}: {a.values.join(' · ')}
              </div>
            ))}
            <p className="text-slate-500">Rules that depend on these values are marked “unclear” and excluded from cost estimates.</p>
          </div>
        </div>
      )}

      {report.warnings.map((w) => (
        <div key={w} className="text-xs text-amber-300/90">⚠ {w}</div>
      ))}

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-800">
                <th className="py-1.5 pr-3 font-medium">Page</th>
                <th className="py-1.5 pr-3 font-medium">Method</th>
                <th className="py-1.5 pr-3 font-medium">OCR confidence</th>
                <th className="py-1.5 pr-3 font-medium">Notes</th>
                <th className="py-1.5 font-medium sr-only">Preview</th>
              </tr>
            </thead>
            <tbody>
              {report.pages.map((p) => {
                const style = METHOD_STYLE[p.method]
                const isOpen = previewPage === p.page_number
                const fullText = pageText.get(p.page_number)?.text ?? p.preview
                return (
                  <Fragment key={p.page_number}>
                    <tr className="border-b border-slate-800/60 align-top">
                      <td className="py-1.5 pr-3 font-mono text-slate-300">{p.page_number}</td>
                      <td className="py-1.5 pr-3">
                        <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold whitespace-nowrap ${style.cls}`}>
                          {style.label}
                        </span>
                      </td>
                      <td className={`py-1.5 pr-3 font-mono ${confidenceTone(p.ocr_confidence)}`}>
                        {p.ocr_confidence !== undefined ? `${p.ocr_confidence}%` : '—'}
                      </td>
                      <td className="py-1.5 pr-3 text-slate-400">
                        {p.needs_clearer_scan && <div className="text-amber-300 font-medium">Needs a clearer scan</div>}
                        {p.warnings.length > 0 ? p.warnings.map((w) => <div key={w}>{w}</div>) : <span className="text-slate-500">{p.reason}</span>}
                      </td>
                      <td className="py-1.5 text-right">
                        <button
                          type="button"
                          className="text-emerald-400 hover:text-emerald-300 whitespace-nowrap"
                          onClick={() => setPreviewPage(isOpen ? null : p.page_number)}
                        >
                          {isOpen ? 'Hide text' : 'View text'}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-slate-800/60">
                        <td colSpan={5} className="py-2">
                          <pre className="text-[11px] leading-relaxed text-slate-300 whitespace-pre-wrap max-h-72 overflow-y-auto font-mono bg-slate-950/80 border border-slate-800 rounded-lg p-3">
                            {fullText || '(no text extracted)'}
                          </pre>
                          {p.method !== 'text_layer' && (
                            <p className="mt-1 text-[10px] text-slate-500">
                              Words marked [?] were read with low OCR confidence. Lines starting with “|” are table rows.
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
