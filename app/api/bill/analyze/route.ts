import { NextRequest, NextResponse } from 'next/server'
import { extractPagesHybrid } from '@/lib/pdf/hybrid'
import { formatPageForPrompt } from '@/lib/pdf/promptFormat'
import { hasPdfHeader, PdfInputError } from '@/lib/pdf/validation'
import type { ExtractedPage } from '@/lib/types/policy'
import { executeWithGeminiFallback } from '@/lib/ai/extractor'
import { parseCurrency } from '@/lib/policy/normalizers'
import type { HospitalBill, HospitalBillLineItem, BillLineCategory, BillPaymentSummary } from '@/lib/types/bill'

export const maxDuration = 120

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const rawTextOverride = formData.get('text') as string | null

    let textContent = rawTextOverride || ''
    let totalPages: number | undefined

    if (file) {
      // Only block truly non-PDF binary files; accept .pdf
      const isPdf =
        file.name.toLowerCase().endsWith('.pdf') ||
        file.type.includes('pdf') ||
        file.type === 'application/octet-stream'

      if (!isPdf) {
        return NextResponse.json(
          { success: false, error: 'Please upload the hospital bill as a PDF (scanned PDFs are supported).' },
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
      let pages: ExtractedPage[] = []

      try {
        // Text layer for digital bills, OCR for scanned ones
        pages = (await extractPagesHybrid(buffer, { signal: request.signal })).pages
      } catch (e) {
        return NextResponse.json(
          {
            success: false,
            error: e instanceof PdfInputError
              ? e.message
              : 'Could not read this PDF. It may be password-protected or corrupted.',
          },
          { status: 422 }
        )
      }

      if (pages.length === 0 || pages.every(p => p.char_count < 20)) {
        return NextResponse.json(
          {
            success: false,
            error:
              'No readable text was found in this bill, even with OCR. ' +
              'Please upload a clearer scan, or type in the bill amounts manually.',
          },
          { status: 422 }
        )
      }

      totalPages = pages.length
      textContent = pages
        .map(p => formatPageForPrompt(p))
        .join('\n\n')
    }

    if (!textContent || textContent.trim().length < 10) {
      return NextResponse.json(
        { success: false, error: 'No bill content provided.' },
        { status: 400 }
      )
    }

    const bill = await extractBillWithAI(textContent, totalPages)

    return NextResponse.json({ success: true, data: bill })
  } catch (err: any) {
    console.error('[bill/analyze]', err)
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to analyze hospital bill.' },
      { status: 500 }
    )
  }
}

// ─── AI extraction ───────────────────────────────────────────────────────────

async function extractBillWithAI(text: string, totalPages?: number): Promise<HospitalBill> {
  const warnings: string[] = []
  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.OPENAI_API_KEY

  if (apiKey) {
    try {
      const isGoogle = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY

      const systemPrompt = `You are a hospital billing expert and medical insurance auditor.

Your task: Extract structured information from a hospital discharge bill or final invoice.

Extract:
1. Hospital header information (name, patient name, bill number, bill date, admission date, discharge date, diagnosis)
2. Every line item charge with: description, category, quantity, unit price, and total amount
3. Payment summary section: subtotal, discount, net payable, amount paid, balance due, advance/deposit

CATEGORY OPTIONS (pick exactly one per line item):
- "room" — room rent, bed charges, nursing charges, ward charges
- "icu" — ICU/CCU/HDU/NICU charges
- "surgery" — OT charges, operation theatre, surgeon procedure fees, anaesthesia machine
- "doctor" — surgeon fee, anesthetist, physician, consultant, ward visit
- "implant" — prosthesis, stent, mesh, IOL, pacemaker, screw, plate
- "medicines" — pharmacy, IV fluids, injections, antibiotics, drugs
- "diagnostics" — blood tests, CBC, LFT, MRI, CT, X-ray, ultrasound, ECG, culture
- "consumables" — gloves, PPE kit, syringes, catheters, drapes, surgical disposables
- "ambulance" — emergency transport, ambulance
- "other" — admin fee, registration, service charge, miscellaneous, sundry, general

IMPORTANT RULES:
- Do NOT include subtotal rows, package header rows, or grand total rows as line items.
- If quantity and unit price are not separately listed, set quantity=1 and unitPrice=amount.
- For sourcePage, provide the page number (integer) where each line item appears.
- Preserve the original bill description exactly in "description".
- Set confidence: "high" if amount is clearly readable, "medium" if inferred, "low" if uncertain.
- Some pages may come from OCR of a scanned bill. A token followed by [?] was read with low OCR confidence: never correct or guess it — set that item's confidence to "low".

Return ONLY valid JSON matching this schema exactly:
{
  "hospitalName": "string or null",
  "patientName": "string or null",
  "billNumber": "string or null",
  "billDate": "YYYY-MM-DD or null",
  "admissionDate": "YYYY-MM-DD or null",
  "dischargeDate": "YYYY-MM-DD or null",
  "diagnosis": "string or null",
  "totalBilledAmount": 150000,
  "paymentSummary": {
    "subtotal": 155000,
    "discount": 5000,
    "netPayable": 150000,
    "deposit": 50000,
    "amountPaid": 80000,
    "balanceDue": 70000
  },
  "lineItems": [
    {
      "id": "item_1",
      "description": "Room Charges - 3 days Private AC",
      "category": "room",
      "quantity": 3,
      "unitPrice": 8000,
      "amount": 24000,
      "sourcePage": 1,
      "confidence": "high"
    }
  ]
}`

      let jsonStr = ''

      if (isGoogle) {
        const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY!
        try {
          jsonStr = await executeWithGeminiFallback(
            apiKey,
            (model) =>
              fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    contents: [
                      {
                        role: 'user',
                        parts: [{ text: `${systemPrompt}\n\nHospital Bill Text:\n${text.slice(0, 40000)}` }],
                      },
                    ],
                    generationConfig: {
                      temperature: 0.1,
                      maxOutputTokens: 4096,
                      responseMimeType: 'application/json',
                    },
                  }),
                }
              ),
            async (res) => {
              const respJson = await res.json()
              return respJson.candidates?.[0]?.content?.parts?.[0]?.text || ''
            }
          )
        } catch (geminiErr: any) {
          warnings.push(`AI extraction warning: ${geminiErr.message}. Falling back to heuristic parsing.`)
          console.warn('[bill/analyze] Gemini error:', geminiErr)
        }
      } else {
        // OpenAI fallback
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Hospital Bill Text:\n${text.slice(0, 40000)}` },
            ],
            temperature: 0.1,
            response_format: { type: 'json_object' },
          }),
        })
        if (res.ok) {
          const respJson = await res.json()
          jsonStr = respJson.choices?.[0]?.message?.content || ''
        } else {
          warnings.push('AI extraction encountered an issue. Using heuristic parser.')
        }
      }

      if (jsonStr) {
        const cleaned = jsonStr
          .replace(/^```json\s*/i, '')
          .replace(/```\s*$/i, '')
          .trim()

        const parsed = JSON.parse(cleaned)
        return buildBillFromAIParsed(parsed, warnings, totalPages, 'ai')
      }
    } catch (e: any) {
      console.warn('[bill/analyze] AI extraction failed, falling back:', e.message)
      warnings.push('AI parsing failed; using heuristic pattern extraction instead.')
    }
  } else {
    warnings.push('No AI API key configured. Using heuristic extraction — results may be less accurate.')
  }

  // Heuristic fallback
  return fallbackBillParser(text, warnings, totalPages)
}

// ─── Build structured HospitalBill from AI JSON ──────────────────────────────

function buildBillFromAIParsed(
  parsed: any,
  warnings: string[],
  totalPages: number | undefined,
  method: 'ai' | 'heuristic' | 'mixed'
): HospitalBill {
  const lineItems: HospitalBillLineItem[] = (parsed.lineItems || []).map(
    (item: any, idx: number) => {
      const qty = Number(item.quantity) || 1
      const unit = Number(item.unitPrice) || 0
      const amt = Number(item.amount) || qty * unit

      return {
        id: item.id || `item_${idx + 1}`,
        description: item.description || `Bill Item ${idx + 1}`,
        category: (item.category || 'other') as BillLineCategory,
        quantity: qty,
        unitPrice: unit || amt,
        amount: amt,
        sourcePage: Number(item.sourcePage) || undefined,
        originalText: item.description || undefined,
        originalAmount: amt,
        confidence: (item.confidence || 'high') as 'high' | 'medium' | 'low',
        isUserEdited: false,
      } satisfies HospitalBillLineItem
    }
  )

  const calculatedLineSum = lineItems.reduce((acc, i) => acc + i.amount, 0)
  const totalBilledAmount =
    Number(parsed.totalBilledAmount) || calculatedLineSum

  const discrepancy = Math.abs(calculatedLineSum - totalBilledAmount)
  if (discrepancy > 100) {
    warnings.push(
      `Bill total (₹${totalBilledAmount.toLocaleString('en-IN')}) differs from ` +
        `itemized sum (₹${calculatedLineSum.toLocaleString('en-IN')}) by ₹${discrepancy.toLocaleString('en-IN')}. ` +
        `This may indicate packages, header rows, or extraction gaps.`
    )
  }

  // Payment summary — only include fields that are actually present
  let paymentSummary: BillPaymentSummary | undefined
  if (parsed.paymentSummary) {
    const ps = parsed.paymentSummary
    paymentSummary = {}
    if (ps.subtotal != null) paymentSummary.subtotal = Number(ps.subtotal)
    if (ps.discount != null) paymentSummary.discount = Number(ps.discount)
    if (ps.netPayable != null) paymentSummary.netPayable = Number(ps.netPayable)
    if (ps.deposit != null) paymentSummary.deposit = Number(ps.deposit)
    if (ps.amountPaid != null) paymentSummary.amountPaid = Number(ps.amountPaid)
    if (ps.balanceDue != null) paymentSummary.balanceDue = Number(ps.balanceDue)
    // If paymentSummary ended up empty, drop it
    if (Object.keys(paymentSummary).length === 0) paymentSummary = undefined
  }

  const highCount = lineItems.filter(i => i.confidence === 'high').length
  const parsingConfidence: 'high' | 'medium' | 'low' =
    lineItems.length === 0
      ? 'low'
      : highCount / lineItems.length > 0.8
      ? 'high'
      : highCount / lineItems.length > 0.5
      ? 'medium'
      : 'low'

  return {
    hospitalName: parsed.hospitalName || undefined,
    patientName: parsed.patientName || undefined,
    billNumber: parsed.billNumber || undefined,
    billDate: parsed.billDate || undefined,
    admissionDate: parsed.admissionDate || undefined,
    dischargeDate: parsed.dischargeDate || undefined,
    diagnosis: parsed.diagnosis || undefined,
    totalBilledAmount,
    calculatedLineSum,
    lineToTotalDiscrepancy: discrepancy,
    paymentSummary,
    lineItems,
    totalPages,
    warnings,
    extractionMethod: method,
    parsingConfidence,
  }
}

// ─── Heuristic fallback parser ───────────────────────────────────────────────

function fallbackBillParser(
  text: string,
  warnings: string[],
  totalPages: number | undefined
): HospitalBill {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)

  const lineItems: HospitalBillLineItem[] = []
  let totalBilledAmount = 0
  let currentPage = 1

  for (const line of lines) {
    const lower = line.toLowerCase()

    // Track page markers from our extractor format "[Page N]"
    const pageMarker = line.match(/^\[Page (\d+)[\]\s]/i)
    if (pageMarker) {
      currentPage = parseInt(pageMarker[1], 10)
      continue
    }

    // Skip clear header/footer/total lines (don't double-count)
    if (
      lower.includes('grand total') ||
      lower.includes('net amount') ||
      lower.includes('net payable') ||
      lower.includes('total payable') ||
      lower.includes('balance due') ||
      lower.includes('amount paid')
    ) {
      const parsed = parseCurrency(line)
      if (parsed && parsed > totalBilledAmount) totalBilledAmount = parsed
      continue
    }

    // Look for price pattern
    const priceMatch = line.match(
      /(?:(?:rs\.?|inr|₹)\s*)?(\d{1,3}(?:,\d{2,3})*(?:\.\d{2})?)/i
    )
    if (
      priceMatch &&
      !lower.includes('date') &&
      !lower.includes('phone') &&
      !lower.includes('pin') &&
      !lower.includes('bill no')
    ) {
      const amount = parseCurrency(priceMatch[1])
      if (amount && amount >= 100 && amount < 10_000_000) {
        let cat: BillLineCategory = 'other'
        if (lower.includes('room') || lower.includes('bed') || lower.includes('nursing')) cat = 'room'
        else if (lower.includes('icu') || lower.includes('ccu')) cat = 'icu'
        else if (lower.includes('ot') || lower.includes('theatre') || lower.includes('operation')) cat = 'surgery'
        else if (lower.includes('surgeon') || lower.includes('doctor') || lower.includes('consult') || lower.includes('physician')) cat = 'doctor'
        else if (lower.includes('implant') || lower.includes('stent') || lower.includes('mesh') || lower.includes('iol')) cat = 'implant'
        else if (lower.includes('pharmacy') || lower.includes('medicine') || lower.includes('drug') || lower.includes('injection')) cat = 'medicines'
        else if (lower.includes('lab') || lower.includes('x-ray') || lower.includes('mri') || lower.includes('ct') || lower.includes('cbc') || lower.includes('test')) cat = 'diagnostics'
        else if (lower.includes('consumable') || lower.includes('disposable') || lower.includes('ppe') || lower.includes('glove')) cat = 'consumables'
        else if (lower.includes('ambulance')) cat = 'ambulance'

        const desc = line
          .replace(priceMatch[0], '')
          .replace(/[:\-_]/g, '')
          .trim() || 'Hospital Service Charge'

        lineItems.push({
          id: `item_${lineItems.length + 1}`,
          description: desc,
          category: cat,
          quantity: 1,
          unitPrice: amount,
          amount,
          sourcePage: currentPage,
          originalText: line,
          originalAmount: amount,
          confidence: 'medium',
          isUserEdited: false,
        })
      }
    }
  }

  const calculatedLineSum = lineItems.reduce((acc, i) => acc + i.amount, 0)
  if (!totalBilledAmount) totalBilledAmount = calculatedLineSum

  warnings.push(
    'Heuristic extraction was used. Check all amounts carefully and correct any mistakes in the table below.'
  )

  return {
    totalBilledAmount,
    calculatedLineSum,
    lineToTotalDiscrepancy: Math.abs(calculatedLineSum - totalBilledAmount),
    lineItems,
    totalPages,
    warnings,
    extractionMethod: 'heuristic',
    parsingConfidence: lineItems.length > 0 ? 'medium' : 'low',
  }
}
