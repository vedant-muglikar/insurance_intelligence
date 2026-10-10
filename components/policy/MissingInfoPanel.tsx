'use client'

import React, { useState } from 'react'
import { MissingField } from '@/lib/types/estimate'
import { HelpCircle, ArrowRight, Check, AlertCircle } from 'lucide-react'

interface MissingInfoPanelProps {
  missingFields: MissingField[]
  onResolveField: (field: string, value: any) => void
}

export function MissingInfoPanel({
  missingFields,
  onResolveField,
}: MissingInfoPanelProps) {
  const [inputValues, setInputValues] = useState<Record<string, any>>({})

  if (missingFields.length === 0) return null

  const handleInputChange = (field: string, val: any) => {
    setInputValues(prev => ({ ...prev, [field]: val }))
  }

  const handleSaveField = (f: MissingField) => {
    const val = inputValues[f.field] ?? f.defaultValue
    if (val !== undefined && val !== '') {
      onResolveField(f.field, val)
    }
  }

  return (
    <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-4 shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        <div className="p-1 rounded-full bg-amber-500/20 text-amber-400">
          <AlertCircle size={15} />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-amber-300">
            Missing Information Engine: {missingFields.length} detail{missingFields.length > 1 ? 's' : ''} needed
          </h4>
          <p className="text-[11px] text-slate-400">
            Supplying these missing facts eliminates uncertainty and makes waiting period and co-pay calculations definitive.
          </p>
        </div>
      </div>

      <div className="space-y-2.5">
        {missingFields.map((field) => (
          <div
            key={field.id}
            className="p-3 rounded-lg bg-[var(--surface)] border border-slate-700/60 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs"
          >
            <div className="flex-1 pr-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-200">{field.label}</span>
                {field.impact === 'blocks_estimate' && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-950 text-red-300 border border-red-700 font-mono">
                    Blocks Waiting Period
                  </span>
                )}
                {field.impact === 'changes_copay' && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-700 font-mono">
                    Affects Co-pay
                  </span>
                )}
              </div>
              <p className="text-slate-400 mt-0.5 text-[11px]">{field.whyItMatters}</p>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
              {field.suggestedInputType === 'date' ? (
                <input
                  type="date"
                  className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
                  value={inputValues[field.field] || ''}
                  onChange={(e) => handleInputChange(field.field, e.target.value)}
                />
              ) : field.suggestedInputType === 'number' ? (
                <input
                  type="number"
                  placeholder={field.defaultValue?.toString() || 'Enter value'}
                  className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400 w-28"
                  value={inputValues[field.field] ?? ''}
                  onChange={(e) => handleInputChange(field.field, parseFloat(e.target.value) || 0)}
                />
              ) : field.suggestedInputType === 'select' && field.options ? (
                <select
                  className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
                  value={inputValues[field.field] || ''}
                  onChange={(e) => handleInputChange(field.field, e.target.value === 'None' ? [] : [e.target.value])}
                >
                  <option value="">Select condition...</option>
                  {field.options.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="Enter details..."
                  className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
                  value={inputValues[field.field] || ''}
                  onChange={(e) => handleInputChange(field.field, e.target.value)}
                />
              )}

              <button
                type="button"
                onClick={() => handleSaveField(field)}
                className="bg-amber-600 hover:bg-amber-500 text-white font-medium px-3 py-1.5 rounded flex items-center gap-1 transition-colors"
              >
                Apply
                <ArrowRight size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
