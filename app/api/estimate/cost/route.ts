import { NextRequest, NextResponse } from 'next/server'
import { MlCostPrediction } from '@/lib/types/estimate'

const ML_SERVICE_URL = (process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
const ML_TIMEOUT_MS = Number(process.env.ML_SERVICE_TIMEOUT_MS) || 6000

const ROOMS = new Set(['general', 'twin', 'single', 'suite'])

function isInt(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
}

export async function POST(request: NextRequest) {
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 })
  }

  const valid =
    typeof body?.procedure_name === 'string' &&
    body.procedure_name.trim().length >= 2 &&
    body.procedure_name.length <= 200 &&
    isInt(body.patient_age, 0, 120) &&
    isInt(body.city_tier, 1, 3) &&
    isInt(body.hospital_tier, 1, 3) &&
    ROOMS.has(body.room_category) &&
    isInt(body.stay_duration_days, 1, 120)
  if (!valid) {
    return NextResponse.json({ success: false, error: 'Invalid cost prediction request.' }, { status: 400 })
  }

  // Forward only the known fields.
  const payload = {
    procedure_name: body.procedure_name.trim(),
    patient_age: body.patient_age,
    city_tier: body.city_tier,
    hospital_tier: body.hospital_tier,
    room_category: body.room_category,
    stay_duration_days: body.stay_duration_days,
  }

  try {
    const res = await fetch(`${ML_SERVICE_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(ML_TIMEOUT_MS),
      cache: 'no-store',
    })

    if (!res.ok) {
      // A 4xx from the service (e.g. unknown procedure) is a miss, not an outage; the caller falls back.
      const status = res.status >= 400 && res.status < 500 ? 422 : 502
      return NextResponse.json({ success: false, error: `ML service rejected the request (${res.status}).` }, { status })
    }

    const ml = await res.json()
    const data: MlCostPrediction = {
      costP10: ml.cost_p10,
      costP50: ml.cost_p50,
      costP90: ml.cost_p90,
      confidenceScore: ml.confidence_score,
      uncertaintyLevel: ml.uncertainty_level,
      itemizedBreakdown: {
        roomAndNursing: ml.itemized_breakdown.room_and_nursing,
        surgeryAndOt: ml.itemized_breakdown.surgery_and_ot,
        doctorFees: ml.itemized_breakdown.doctor_fees,
        medicinesAndImplants: ml.itemized_breakdown.medicines_and_implants,
        consumables: ml.itemized_breakdown.consumables,
      },
      costDrivers: ml.cost_drivers ?? [],
      matchedProcedure: ml.matched_procedure,
      modelVersion: ml.model_version,
      extrapolated: !!ml.extrapolated,
      warnings: ml.warnings ?? [],
    }
    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('[api/estimate/cost] ML service unreachable:', err)
    return NextResponse.json({ success: false, error: 'ML cost service unavailable.' }, { status: 503 })
  }
}
