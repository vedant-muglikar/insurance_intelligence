/**
 * Splits the typical treatment cost into plain parts (room, theatre, doctor fees, medicines, supplies...) with the
 * share of the bill each one is and a one-line reason. Pure arithmetic over the cost engine's own components, so
 * every figure shown is one the estimate already used.
 */

import type { CostBreakdown, CostBreakdownRow, CostComponents, CostSource, TreatmentScenario } from '@/lib/types/estimate'
import { formatINR } from '@/lib/policy/normalizers'

const ROOM_NAME: Record<TreatmentScenario['roomType'], string> = {
  general: 'general ward',
  'twin-sharing': 'twin sharing room',
  'single-private': 'single private room',
  suite: 'suite',
  icu: 'ICU bed',
}

interface Meta {
  label: string
  what: string
}

const META: Record<keyof CostComponents, Meta> = {
  room: { label: 'Room and nursing', what: 'Bed, nursing and ward charges' },
  surgery: { label: 'Theatre and procedure', what: 'Operation theatre, equipment and procedure charges' },
  doctor: { label: 'Doctor fees', what: 'Surgeon, anaesthetist and specialist visits' },
  medicines: { label: 'Medicines', what: 'Drugs, IV fluids and injections' },
  consumables: { label: 'Supplies and disposables', what: 'Gloves, syringes, catheters, dressings and drapes' },
  diagnostics: { label: 'Tests and scans', what: 'Blood tests, X-rays, scans and other investigations' },
  implants: { label: 'Implants and devices', what: 'Implant or device used in the procedure (stent, lens, mesh, joint)' },
  ambulance: { label: 'Ambulance', what: 'Patient transport' },
  other: { label: 'Other charges', what: 'Registration, admin and anything not listed above' },
}

const NOTE: Record<CostSource, string> = {
  hospital_quote: 'These parts come straight from the line items on your hospital quote.',
  manual_quote: 'You gave the total, so the split is a typical one for this kind of treatment, not your hospital’s own.',
  ml_model: 'The cost model estimates each part separately. They are scaled so the parts add up to the typical total.',
  benchmark: 'Typical prices for this treatment, adjusted for your city, hospital type, room and number of days.',
  synthetic: 'A generic split. This treatment is not in our price list, so treat it as a rough guide only.',
}

export function buildCostBreakdown(args: {
  components: CostComponents
  total: number
  stayDays: number
  scenario: TreatmentScenario
  source: CostSource
}): CostBreakdown | undefined {
  const { components, total, stayDays, scenario, source } = args
  const entries = (Object.entries(components) as Array<[keyof CostComponents, number | undefined]>).filter(
    ([, v]) => typeof v === 'number' && v > 0,
  ) as Array<[keyof CostComponents, number]>
  const sum = entries.reduce((a, [, v]) => a + v, 0)
  if (!entries.length || !sum || !total) return undefined

  // Parts and total can differ a little (separate models, rounding). Scale so the parts add up exactly.
  const scaled = Math.abs(sum - total) / total > 0.01
  const amounts = entries.map(([, v]) => Math.round((v * total) / sum))
  const drift = total - amounts.reduce((a, v) => a + v, 0)
  const biggest = amounts.indexOf(Math.max(...amounts))
  amounts[biggest] += drift

  const rows: CostBreakdownRow[] = entries
    .map(([key], i) => {
      const meta = META[key]
      const amount = amounts[i]
      let label = meta.label
      let why = meta.what
      if (key === 'room') {
        why = `${stayDays} day${stayDays === 1 ? '' : 's'} in a ${ROOM_NAME[scenario.roomType]}, about ${formatINR(Math.round(amount / Math.max(1, stayDays)))} a day`
      }
      if (key === 'medicines' && source === 'ml_model') {
        label = 'Medicines and implants'
        why = 'Drugs, IV fluids, injections and any implant used'
      }
      return { key, label, amount, sharePct: Math.max(1, Math.round((amount / total) * 100)), why }
    })
    .sort((a, b) => b.amount - a.amount)

  return { rows, total, scaled, note: NOTE[source] }
}
