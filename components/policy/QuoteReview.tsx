'use client'

import React, { useState } from 'react'
import { QuoteLineItem, ParsedHospitalQuote } from '@/lib/types/estimate'
import { formatINR } from '@/lib/policy/normalizers'
import { Upload, Plus, Trash2, CheckCircle2, AlertTriangle, FileText, RefreshCw } from 'lucide-react'

interface QuoteReviewProps {
  initialQuote?: ParsedHospitalQuote | null
  onSaveQuote: (lineItems: QuoteLineItem[], totalQuotedAmount: number) => void
  onCancel?: () => void
}

export function QuoteReview({
  initialQuote,
  onSaveQuote,
  onCancel,
}: QuoteReviewProps) {
  const [lineItems, setLineItems] = useState<QuoteLineItem[]>(initialQuote?.lineItems || [])
  const [totalAmount, setTotalAmount] = useState<number>(initialQuote?.totalAmount || 0)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    setUploadError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/quote/analyze', {
        method: 'POST',
        body: formData,
      })
      const json = await res.json()

      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to extract hospital quote')
      }

      const parsed: ParsedHospitalQuote = json.data
      setLineItems(parsed.lineItems)
      setTotalAmount(parsed.totalAmount || parsed.calculatedSum)
    } catch (err: any) {
      setUploadError(err.message || 'Quotation extraction failed')
    } finally {
      setIsUploading(false)
    }
  }

  const handleItemChange = (index: number, field: keyof QuoteLineItem, value: any) => {
    const updated = [...lineItems]
    const item = { ...updated[index], [field]: value }

    // Recompute amount if quantity or unitPrice changed
    if (field === 'quantity' || field === 'unitPrice') {
      const qty = Number(field === 'quantity' ? value : item.quantity) || 1
      const up = Number(field === 'unitPrice' ? value : item.unitPrice) || 0
      item.amount = qty * up
    }

    updated[index] = item
    setLineItems(updated)
  }

  const handleAddItem = () => {
    const newItem: QuoteLineItem = {
      id: `item_manual_${Date.now()}`,
      category: 'surgery',
      description: 'New Charge Item',
      quantity: 1,
      unitPrice: 10000,
      amount: 10000,
      confidence: 'high',
    }
    setLineItems([...lineItems, newItem])
  }

  const handleDeleteItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index))
  }

  const calculatedSum = lineItems.reduce((acc, curr) => acc + curr.amount, 0)
  const discrepancy = Math.abs(calculatedSum - (totalAmount || calculatedSum))

  const handleConfirm = () => {
    onSaveQuote(lineItems, totalAmount || calculatedSum)
  }

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
        <div>
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-400" />
            Hospital Estimate & Itemized Quotation
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Upload your hospital quotation PDF or enter line items. Real estimates give 100% clause-to-rupee precision.
          </p>
        </div>

        {/* Upload Button */}
        <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors">
          <Upload size={13} />
          <span>{isUploading ? 'Parsing Quote...' : 'Upload Estimate PDF'}</span>
          <input
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handleFileUpload}
            disabled={isUploading}
          />
        </label>
      </div>

      {uploadError && (
        <div className="p-3 rounded-lg bg-red-950/30 border border-red-500/30 text-xs text-red-300">
          {uploadError}
        </div>
      )}

      {/* Line Item Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="text-[11px] text-slate-400 uppercase bg-slate-900 border-b border-slate-800">
            <tr>
              <th className="py-2.5 px-3">Category</th>
              <th className="py-2.5 px-3">Description</th>
              <th className="py-2.5 px-3 text-right">Qty</th>
              <th className="py-2.5 px-3 text-right">Unit Rate</th>
              <th className="py-2.5 px-3 text-right">Total Amount</th>
              <th className="py-2.5 px-3 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-sans">
            {lineItems.map((item, idx) => (
              <tr key={item.id} className="hover:bg-slate-900/40">
                <td className="py-2 px-3">
                  <select
                    className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-300 capitalize text-xs"
                    value={item.category}
                    onChange={(e) => handleItemChange(idx, 'category', e.target.value)}
                  >
                    <option value="room">Room / Bed</option>
                    <option value="icu">ICU / CCU</option>
                    <option value="surgery">Surgery / OT</option>
                    <option value="doctor">Doctor / Consultation</option>
                    <option value="implant">Medical Implant</option>
                    <option value="medicines">Pharmacy / Meds</option>
                    <option value="diagnostics">Diagnostics</option>
                    <option value="consumables">Consumables</option>
                    <option value="ambulance">Ambulance</option>
                    <option value="other">Other / Admin</option>
                  </select>
                </td>
                <td className="py-2 px-3">
                  <input
                    type="text"
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-xs"
                    value={item.description}
                    onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                  />
                </td>
                <td className="py-2 px-3 text-right">
                  <input
                    type="number"
                    min="1"
                    className="w-14 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-xs text-right"
                    value={item.quantity}
                    onChange={(e) => handleItemChange(idx, 'quantity', parseFloat(e.target.value) || 1)}
                  />
                </td>
                <td className="py-2 px-3 text-right">
                  <input
                    type="number"
                    min="0"
                    className="w-24 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-xs text-right"
                    value={item.unitPrice}
                    onChange={(e) => handleItemChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                  />
                </td>
                <td className="py-2 px-3 text-right font-semibold text-emerald-400 font-mono">
                  {formatINR(item.amount)}
                </td>
                <td className="py-2 px-3 text-center">
                  <button
                    type="button"
                    onClick={() => handleDeleteItem(idx)}
                    className="text-slate-500 hover:text-red-400 p-1 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={handleAddItem}
          className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1 border border-slate-700 transition-colors"
        >
          <Plus size={13} />
          Add Charge Item
        </button>

        <div className="text-right text-xs">
          <span className="text-slate-400 mr-2">Sum of Line Items:</span>
          <span className="text-sm font-bold text-white font-mono">{formatINR(calculatedSum)}</span>
        </div>
      </div>

      {discrepancy > 100 && (
        <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-500/30 text-xs text-amber-300 flex items-center gap-2">
          <AlertTriangle size={14} className="shrink-0" />
          <span>
            Hospital total (₹{totalAmount.toLocaleString('en-IN')}) differs from itemized sum (₹{calculatedSum.toLocaleString('en-IN')}). Using itemized sum for calculation.
          </span>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-2 text-xs rounded-lg text-slate-400 hover:text-white"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={handleConfirm}
          className="bg-[var(--brand)] hover:bg-[var(--brand-hi)] text-[var(--on-brand)] font-semibold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 transition-colors"
        >
          <CheckCircle2 size={14} />
          Confirm & Recompute Preflight
        </button>
      </div>
    </div>
  )
}
