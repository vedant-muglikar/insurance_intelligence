import { NextRequest, NextResponse } from 'next/server'
import { extractPagesHybrid } from '@/lib/pdf/hybrid'
import { formatPageForPrompt } from '@/lib/pdf/promptFormat'
import { hasPdfHeader, PdfInputError } from '@/lib/pdf/validation'
import type { ExtractedPage } from '@/lib/types/policy'
import { executeWithGeminiFallback } from '@/lib/ai/extractor'
import { parseCurrency } from '@/lib/policy/normalizers'
import type { HospitalBill, HospitalBillLineItem, BillLineCategory, BillPaymentSummary } from '@/lib/types/bill'

export const maxDuration = 120

const MAX_BILL_BYTES = 12 * 1024 * 1024

interface BillMedia {
  mimeType: string
  data: string // base64
}

function guessImageType(name: string): string {
  if (name.endsWith('.png')) return 'image/png'
  if (name.endsWith('.webp')) return 'image/webp'
  if (name.endsWith('.heic')) return 'image/heic'
  if (name.endsWith('.heif')) return 'image/heif'
  return 'image/jpeg'
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const rawTextOverride = formData.get('text') as string | null

    let textContent = rawTextOverride || ''
    let totalPages: number | undefined

    let media: BillMedia | undefined

    if (file) {
      const name = file.name.toLowerCase()
      const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|heic|heif)$/.test(name)
      const isPdf = name.endsWith('.pdf') || file.type.includes('pdf')

      if (!isPdf && !isImage) {
        return NextResponse.json(
          { success: false, error: 'Please upload the bill as a PDF (scanned PDFs supported) or a photo (JPG, PNG, WebP).' },
          { status: 400 }
        )
      }
      if (file.size > MAX_BILL_BYTES) {
        return NextResponse.json({ success: false, error: 'That file is over 12 MB. Try a smaller photo or PDF.' }, { status: 400 })
      }

      const buffer = await file.arrayBuffer()

      if (isImage) {
        // A photo has no text layer: the multimodal model reads it directly
        media = { mimeType: file.type || guessImageType(name), data: Buffer.from(buffer).toString('base64') }
        totalPages = 1
      } else {
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
          pages = []
        }

        if (pages.length === 0 || pages.every(p => p.char_count < 20)) {
          // Scanned PDF fallback: hand the PDF directly to multimodal model
          media = { mimeType: 'application/pdf', data: Buffer.from(buffer).toString('base64') }
          totalPages = 1
        } else {
          totalPages = pages.length
          textContent = pages
            .map(p => formatPageForPrompt(p))
            .join('\n\n')
        }
      }
    }

    if (!media && (!textContent || textContent.trim().length < 10)) {
      return NextResponse.json(
        { success: false, error: 'No bill content provided.' },
        { status: 400 }
      )
    }

    const bill = await extractBillWithAI(textContent, totalPages, media)

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

async function extractBillWithAI(text: string, totalPages?: number, media?: BillMedia): Promise<HospitalBill> {
  const warnings: string[] = []
  if (!media && text.length > 40000) {
    warnings.push('This bill is very long, so only the first 40,000 characters were read. Charges after that may be missing.')
  }
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
- Copy numbers exactly as printed. NEVER estimate, round, infer or invent a charge, amount, date or name. If something is unreadable or missing, use null for header fields or confidence "low" for a line, and leave out anything you cannot actually see.
- If the same row appears twice in the bill, list it twice; do not merge or deduplicate rows.
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
                        parts: media
                          ? [
                              { text: `${systemPrompt}\n\nThe hospital bill is attached as an ${media.mimeType === 'application/pdf' ? 'PDF' : 'image'}.` },
                              { inlineData: { mimeType: media.mimeType, data: media.data } },
                            ]
                          : [{ text: `${systemPrompt}\n\nHospital Bill Text:\n${text.slice(0, 40000)}` }],
                      },
                    ],
                    generationConfig: {
                      temperature: 0,
                      maxOutputTokens: 8192,
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
              {
                role: 'user',
                content: media
                  ? media.mimeType.startsWith('image/')
                    ? [
                        { type: 'text', text: 'Hospital bill image attached.' },
                        { type: 'image_url', image_url: { url: `data:${media.mimeType};base64,${media.data}` } },
                      ]
                    : 'A scanned PDF was uploaded but cannot be read without Gemini.'
                  : `Hospital Bill Text:\n${text.slice(0, 40000)}`,
              },
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
        const built = buildBillFromAIParsed(parsed, warnings, totalPages, media ? 'vision' : 'ai')
        return media ? addPhotoWarning(built) : groundAgainstSource(built, text)
      }
    } catch (e: any) {
      console.warn('[bill/analyze] AI extraction failed, falling back:', e.message)
      warnings.push('AI parsing failed; using heuristic pattern extraction instead.')
    }
  } else {
    warnings.push('No AI API key configured. Using heuristic extraction — results may be less accurate.')
  }

  // Heuristic fallback (needs text; a photo or scanned PDF cannot be parsed without the model)
  if (media) {
    throw new Error('Could not read this bill automatically. Try a clearer, well-lit photo or a text-based PDF.')
  }
  return fallbackBillParser(text, warnings, totalPages)
}

// ─── Anti-hallucination checks ───────────────────────────────────────────────

/** Whole-rupee figures printed anywhere in the source text. */
function figuresPrinted(text: string): Set<number> {
  const out = new Set<number>()
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const v = parseFloat(m[0].replace(/,/g, ''))
    if (Number.isFinite(v)) out.add(Math.round(v))
  }
  return out
}

/**
 * The model reads the bill, but it must not be trusted to have copied it faithfully. Every extracted line is
 * checked against the PDF's own text: its amount must be printed there, and its description should be too.
 * Lines that fail are kept (never silently dropped) but marked low confidence and counted in a warning.
 */
function groundAgainstSource(bill: HospitalBill, text: string): HospitalBill {
  const figures = figuresPrinted(text)
  const haystack = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ')
  let amountMissing = 0
  let descMissing = 0

  for (const item of bill.lineItems) {
    const amountOk = figures.has(Math.round(item.amount))
    const tokens = (item.description || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((t) => t.length > 3)
    const found = tokens.filter((t) => haystack.includes(t)).length
    const descOk = tokens.length === 0 || found / tokens.length >= 0.5

    if (!amountOk) amountMissing++
    if (!descOk) descMissing++
    if (!amountOk || !descOk) item.confidence = 'low'
  }

  if (amountMissing > 0) {
    bill.warnings.push(`${amountMissing} charge${amountMissing > 1 ? 's' : ''} had an amount that could not be found in the bill text. Marked low confidence: please check ${amountMissing > 1 ? 'them' : 'it'}.`)
  }
  if (descMissing > 0) {
    bill.warnings.push(`${descMissing} charge${descMissing > 1 ? 's' : ''} had a description that does not appear in the bill text. Marked low confidence.`)
  }
  if (amountMissing + descMissing > 0) bill.parsingConfidence = 'low'
  return bill
}

/** A photo cannot be cross-checked against a text layer, so say so and rely on the arithmetic checks. */
function addPhotoWarning(bill: HospitalBill): HospitalBill {
  bill.warnings.unshift('Read from a photo or scan. Digits can be misread, so please check the amounts against your bill.')
  if (bill.parsingConfidence === 'high') bill.parsingConfidence = 'medium'
  return bill
}

// ─── Build structured HospitalBill from AI JSON ──────────────────────────────

function buildBillFromAIParsed(
  parsed: any,
  warnings: string[],
  totalPages: number | undefined,
  method: 'ai' | 'heuristic' | 'mixed' | 'vision'
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
        confidence: (item.confidence || 'medium') as 'high' | 'medium' | 'low',
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
