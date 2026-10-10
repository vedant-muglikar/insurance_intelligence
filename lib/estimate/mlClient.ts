/**
 * PolicyLens - ML cost model client.
 * Maps a TreatmentScenario onto the ML microservice request and fetches a
 * dynamic cost distribution through the Next.js proxy (/api/estimate/cost).
 * Any failure resolves to null so callers fall back to the static benchmark.
 */

import { MlCostPrediction, TreatmentScenario } from '../types/estimate'
import { getCityTier } from './dataset'
import { matchTreatmentWithCandidates } from './matching'

export interface MlCostRequest {
  procedure_name: string
  patient_age: number
  city_tier: 1 | 2 | 3
  hospital_tier: 1 | 2 | 3
  room_category: 'general' | 'twin' | 'single' | 'suite'
  stay_duration_days: number
}

// categoryKey (benchmark dataset) -> procedure name the ML service was trained on
const CATEGORY_TO_ML_PROCEDURE: Record<string, string> = {
  appendectomy: 'Appendectomy',
  knee_replacement: 'Total Knee Replacement',
  cataract: 'Cataract Surgery',
  maternity_normal: 'Normal Delivery',
  maternity_csection: 'Caesarean Section',
  angioplasty: 'Coronary Angioplasty',
  cabg: 'Coronary Artery Bypass Graft (CABG)',
  cholecystectomy: 'Cholecystectomy',
  hernia_repair: 'Hernia Repair',
  hip_replacement: 'Total Hip Replacement',
  kidney_stone: 'Kidney Stone Lithotripsy',
  tonsillectomy: 'Tonsillectomy',
  hysterectomy: 'Hysterectomy',
  dengue_treatment: 'Dengue Inpatient Care',
  hemodialysis: 'Hemodialysis (Single Session)',
  chemotherapy: 'Chemotherapy Infusion Cycle',
}

const ROOM_MAP: Record<TreatmentScenario['roomType'], MlCostRequest['room_category']> = {
  general: 'general',
  'twin-sharing': 'twin',
  'single-private': 'single',
  suite: 'suite',
  icu: 'suite', // closest tariff class the model knows
}

const HOSPITAL_TIER_MAP: Record<TreatmentScenario['hospitalType'], MlCostRequest['hospital_tier']> = {
  corporate: 1,
  private: 2,
  public: 3,
}

export function buildMlRequest(scenario: TreatmentScenario): MlCostRequest {
  const best = matchTreatmentWithCandidates(scenario).bestMatch
  const procedure = (best && CATEGORY_TO_ML_PROCEDURE[best.categoryKey]) || scenario.treatment
  const cityTier = Number(getCityTier(scenario.city).split(' ')[1]) as MlCostRequest['city_tier']
  return {
    procedure_name: procedure,
    patient_age: Math.min(120, Math.max(0, Math.round(scenario.age))),
    city_tier: cityTier,
    hospital_tier: HOSPITAL_TIER_MAP[scenario.hospitalType],
    room_category: ROOM_MAP[scenario.roomType],
    stay_duration_days: Math.min(120, Math.max(1, Math.round(scenario.stayDurationDays || 1))),
  }
}

/** A user-supplied quote always outranks the model, so there is no point calling it. */
export function scenarioNeedsMlCost(scenario: TreatmentScenario): boolean {
  const hasQuote =
    !!(scenario.quoteLineItems && scenario.quoteLineItems.length > 0) || !!(scenario.quotedCost && scenario.quotedCost > 0)
  return !hasQuote && !!scenario.treatment?.trim()
}

const cache = new Map<string, MlCostPrediction | null>()
const CACHE_LIMIT = 200

export async function fetchMlCostPrediction(
  scenario: TreatmentScenario,
  signal?: AbortSignal
): Promise<MlCostPrediction | null> {
  if (!scenarioNeedsMlCost(scenario)) return null

  const key = JSON.stringify(buildMlRequest(scenario))
  if (cache.has(key)) return cache.get(key) ?? null

  try {
    const res = await fetch('/api/estimate/cost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: key,
      signal,
    })
    if (!res.ok) throw new Error(`ML cost route returned ${res.status}`)
    const json = await res.json()
    const prediction: MlCostPrediction | null = json?.success ? json.data : null
    if (prediction) {
      if (cache.size >= CACHE_LIMIT) cache.clear()
      cache.set(key, prediction)
    }
    return prediction
  } catch (err) {
    // Aborts and outages both degrade to the static benchmark; failures are not cached.
    if ((err as Error)?.name !== 'AbortError') console.warn('[ml-cost] falling back to static benchmark:', err)
    return null
  }
}
