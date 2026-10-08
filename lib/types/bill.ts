/**
 * ClaimLens — Hospital Bill Audit Types (Phase 1)
 *
 * HospitalBillLineItem extends the existing QuoteLineItem concept with
 * additional fields needed for post-hospitalization bill verification:
 * - originalText: verbatim text as extracted from the PDF (preserved separately from user edits)
 * - sourcePage: the page number in the bill where this line was found
 * - isUserEdited: flag set when the user corrects an extraction error
 *
 * HospitalBill is a richer superset of ParsedHospitalQuote tailored for
 * final discharge bills (not pre-admission estimates), containing structured
 * payment breakdown information extracted from the bill document.
 */

// ─── Bill Line Item ──────────────────────────────────────────────────────────

export type BillLineCategory =
  | 'room'
  | 'icu'
  | 'surgery'
  | 'doctor'
  | 'implant'
  | 'medicines'
  | 'diagnostics'
  | 'consumables'
  | 'ambulance'
  | 'other'

export interface HospitalBillLineItem {
  id: string

  // Extracted data
  description: string
  category: BillLineCategory
  quantity: number
  unitPrice: number
  amount: number

  // Evidence & extraction metadata
  sourcePage?: number           // page in the bill PDF
  originalText?: string         // verbatim text from PDF (immutable after extraction)
  originalAmount?: number       // original extracted amount (preserved when user edits)
  confidence: 'high' | 'medium' | 'low'

  // User correction tracking
  isUserEdited?: boolean
}

// ─── Payment Summary (extracted from bill footer) ────────────────────────────

export interface BillPaymentSummary {
  subtotal?: number         // sum of all charges before discounts
  discount?: number         // discount/waiver applied by hospital
  deposit?: number          // advance deposit paid at admission
  netPayable?: number       // amount after discount (may differ from sum of line items)
  amountPaid?: number       // amount already paid (cleared)
  balanceDue?: number       // outstanding balance
}

// ─── Hospital Bill (final discharge bill) ────────────────────────────────────

export interface HospitalBill {
  // Hospital and patient identity
  hospitalName?: string
  patientName?: string
  billNumber?: string
  billDate?: string       // ISO date string if extractable
  admissionDate?: string
  dischargeDate?: string
  diagnosis?: string

  // Core billing amounts
  totalBilledAmount: number      // gross total from the bill header/footer
  calculatedLineSum: number      // sum of all extracted line items
  lineToTotalDiscrepancy: number // |calculatedLineSum - totalBilledAmount|

  // Structured payment breakdown
  paymentSummary?: BillPaymentSummary

  // Line items
  lineItems: HospitalBillLineItem[]

  // Extraction metadata
  totalPages?: number
  rawTextSample?: string  // first 500 chars of bill text (for debugging)
  warnings: string[]      // non-fatal extraction issues

  // Parsing quality
  extractionMethod: 'ai' | 'heuristic' | 'mixed'
  parsingConfidence: 'high' | 'medium' | 'low'
}
