import { NextRequest, NextResponse } from 'next/server'
import { extractPagesHybrid } from '@/lib/pdf/hybrid'
import { formatPageForPrompt } from '@/lib/pdf/promptFormat'
import { hasPdfHeader } from '@/lib/pdf/validation'
import { executeWithGeminiFallback } from '@/lib/ai/extractor'
import { QuoteLineItem, ParsedHospitalQuote } from '@/lib/types/estimate'
import { parseCurrency } from '@/lib/policy/normalizers'

export const maxDuration = 120

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const rawTextOverride = formData.get('text') as string | null

    let textContent = rawTextOverride || ''

    if (file) {
      if (!file.name.toLowerCase().endsWith('.pdf') && !file.type.includes('pdf')) {
        return NextResponse.json(
          { success: false, error: 'Only PDF quotation documents are supported.' },
          { status: 400 }
        )
      }

      const buffer = await file.arrayBuffer()
      if (!hasPdfHeader(new Uint8Array(buffer))) {
        return NextResponse.json(
          { success: false, error: 'This file is not a valid PDF document.' },
          { status: 400 }
        )
      }
      // Text layer for digital quotes, OCR for scanned ones
      const { pages } = await extractPagesHybrid(buffer, { signal: request.signal })
      if (pages.length === 0 || pages.every(p => p.text.trim().length === 0)) {
        return NextResponse.json(
          { success: false, error: 'Could not extract text from quotation PDF, even with OCR. Please upload a clearer scan.' },
          { status: 422 }
        )
      }
      textContent = pages.map(p => formatPageForPrompt(p)).join('\n\n')
    }

    if (!textContent || textContent.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'No quotation content provided.' },
        { status: 400 }
      )
    }

    // Try AI extraction of line items
    const parsedQuote = await extractQuoteWithAI(textContent)

    return NextResponse.json({
      success: true,
      data: parsedQuote,
    })
  } catch (err: any) {
    console.error('[quote/analyze]', err)
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Failed to analyze hospital estimate.',
      },
      { status: 500 }
    )
  }
}

async function extractQuoteWithAI(text: string): Promise<ParsedHospitalQuote> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  const warnings: string[] = []

  // If AI key is available, call structured LLM
  if (apiKey) {
    try {
      const isGoogle = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY
      const systemPrompt = `You are a medical hospital bill and quotation auditor.
Extract the hospital name, patient name (if present), total quoted amount, and an itemized list of all charge line items from the hospital estimate.

Categorize each line item into exactly one of:
- 'room' (room rent, nursing charges, bed fee)
- 'icu' (ICU/CCU/HDU charges)
- 'surgery' (OT charges, procedure fee, anaesthesia machine)
- 'doctor' (surgeon fee, anesthetist consultation, physician visits)
- 'implant' (prosthesis, stent, mesh, pacemaker, orthopaedic implant)
- 'medicines' (pharmacy, IV fluids, injections)
- 'diagnostics' (pathology, MRI, CT, X-ray, ultrasound, ECG, blood tests)
- 'consumables' (gloves, PPE, syringes, surgical disposables)
- 'ambulance' (emergency transport)
- 'other' (administrative, hospital registration, service fee)

Output ONLY valid JSON:
{
  "hospitalName": "string or undefined",
  "patientName": "string or undefined",
  "totalAmount": 150000,
  "lineItems": [
    {
      "id": "item_1",
      "category": "room|icu|surgery|doctor|implant|medicines|diagnostics|consumables|ambulance|other",
      "description": "Room Charges - 3 days Private AC",
      "quantity": 3,
      "unitPrice": 8000,
      "amount": 24000,
      "confidence": "high|medium|low"
    }
  ]
}`

      let jsonStr = ''

        jsonStr = await executeWithGeminiFallback(
          apiKey,
          (model) => fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nDocument Text:\n${text.slice(0, 40000)}` }] }],
                generationConfig: {
                  temperature: 0.1,
                  maxOutputTokens: 2048,
                  responseMimeType: 'application/json',
                },
              }),
            }
          ),
          async (response) => {
            const respJson = await response.json()
            return respJson.candidates?.[0]?.content?.parts?.[0]?.text || ''
          }
        )

      if (jsonStr) {
        const cleaned = jsonStr.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
        const parsed = JSON.parse(cleaned)
        const lineItems: QuoteLineItem[] = (parsed.lineItems || []).map((item: any, idx: number) => ({
          id: item.id || `item_${idx + 1}`,
          category: item.category || 'other',
          description: item.description || `Charge Item ${idx + 1}`,
          quantity: Number(item.quantity) || 1,
          unitPrice: Number(item.unitPrice) || Number(item.amount) || 0,
          amount: Number(item.amount) || (Number(item.quantity) || 1) * (Number(item.unitPrice) || 0),
          confidence: item.confidence || 'high',
        }))

        const calculatedSum = lineItems.reduce((acc, curr) => acc + curr.amount, 0)
        const totalAmount = Number(parsed.totalAmount) || calculatedSum
        const discrepancy = Math.abs(calculatedSum - totalAmount)

        if (discrepancy > 100) {
          warnings.push(`Quoted total (₹${totalAmount.toLocaleString('en-IN')}) differs from itemized sum (₹${calculatedSum.toLocaleString('en-IN')}) by ₹${discrepancy.toLocaleString('en-IN')}.`)
        }

        return {
          hospitalName: parsed.hospitalName,
          patientName: parsed.patientName,
          totalAmount,
          calculatedSum,
          discrepancy,
          lineItems,
          warnings,
          rawText: text.slice(0, 500),
        }
      }
    } catch (e: any) {
      console.warn('AI quote extraction encountered error, falling back to heuristic parsing:', e.message)
      warnings.push('AI parsing encountered an issue; falling back to tabular pattern extraction.')
    }
  }

  // Heuristic / deterministic fallback parser for quotation bills
  return fallbackQuoteParser(text, warnings)
}

function fallbackQuoteParser(text: string, warnings: string[]): ParsedHospitalQuote {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  const lineItems: QuoteLineItem[] = []
  let totalAmount = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lower = line.toLowerCase()

    // Detect Total line
    if (lower.includes('total') || lower.includes('grand total') || lower.includes('net amount')) {
      const parsed = parseCurrency(line)
      if (parsed) totalAmount = parsed
      continue
    }

    // Check if line contains a price
    const priceMatch = line.match(/(?:(?:rs\.?|inr|₹)\s*)?(\d{1,3}(?:,\d{2,3})*(?:\.\d{2})?)/i)
    if (priceMatch && !lower.includes('date') && !lower.includes('phone') && !lower.includes('pincode')) {
      const amount = parseCurrency(priceMatch[1])
      if (amount && amount >= 500 && amount < 10000000) {
        let cat: QuoteLineItem['category'] = 'other'
        if (lower.includes('room') || lower.includes('bed') || lower.includes('nursing')) cat = 'room'
        else if (lower.includes('icu') || lower.includes('ccu')) cat = 'icu'
        else if (lower.includes('ot') || lower.includes('theatre') || lower.includes('surgery')) cat = 'surgery'
        else if (lower.includes('surgeon') || lower.includes('doctor') || lower.includes('consult')) cat = 'doctor'
        else if (lower.includes('implant') || lower.includes('stent') || lower.includes('mesh')) cat = 'implant'
        else if (lower.includes('pharmacy') || lower.includes('medicine') || lower.includes('drug')) cat = 'medicines'
        else if (lower.includes('investigation') || lower.includes('lab') || lower.includes('x-ray') || lower.includes('mri')) cat = 'diagnostics'
        else if (lower.includes('consumable') || lower.includes('disposable') || lower.includes('ppe')) cat = 'consumables'

        const desc = line.replace(priceMatch[0], '').replace(/[:\-_]/g, '').trim() || `Medical Service Charge`

        lineItems.push({
          id: `item_${lineItems.length + 1}`,
          category: cat,
          description: desc,
          quantity: 1,
          unitPrice: amount,
          amount: amount,
          confidence: 'medium',
        })
      }
    }
  }

  const calculatedSum = lineItems.reduce((acc, curr) => acc + curr.amount, 0)
  if (totalAmount === 0) totalAmount = calculatedSum

  return {
    hospitalName: 'Hospital / Healthcare Provider',
    totalAmount,
    calculatedSum,
    discrepancy: Math.abs(calculatedSum - totalAmount),
    lineItems,
    warnings,
  }
}
