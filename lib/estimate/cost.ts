/**
 * PolicyLens - Cost Estimation Engine (Blueprint Section 9)
 * Priority 1: Uploaded hospital quotation or user line items
 * Priority 2: ML quantile model (LightGBM microservice) - dynamic P10/P50/P90 + line items
 * Priority 3: Static benchmark with stay-day and tier scaling (used when the ML service is unavailable)
 * Fallback: Labelled synthetic fallback range
 */

import { TreatmentCostData, TreatmentScenario, CostComponents, QuoteLineItem, MlCostPrediction, CostModelInfo, CostSource } from '../types/estimate'
import { getCityTier, getCityTierMultiplier, getHospitalMultiplier, getRoomMultiplier } from './dataset'

export interface DetailedCostResult {
  min: number
  avg: number
  max: number
  costSource: CostSource
  costModel?: CostModelInfo
  components: CostComponents
  lineItems: QuoteLineItem[]
  stayDurationDays: number
  sourceLabel: string
}

export function estimateCost(
  scenario: TreatmentScenario,
  data: TreatmentCostData | null,
  ml?: MlCostPrediction | null
): { min: number; avg: number; max: number } {
  const detailed = estimateCostDetailed(scenario, data, ml)
  return { min: detailed.min, avg: detailed.avg, max: detailed.max }
}

export function estimateCostDetailed(
  scenario: TreatmentScenario,
  data: TreatmentCostData | null,
  ml?: MlCostPrediction | null
): DetailedCostResult {
  const stayDays = Math.max(1, scenario.stayDurationDays || 1)

  // ─── Priority 1: Hospital Quote Line Items ──────────────────────────────────
  if (scenario.quoteLineItems && scenario.quoteLineItems.length > 0) {
    const total = scenario.quoteLineItems.reduce((acc, item) => acc + item.amount, 0)
    const comps = summarizeLineItemsToComponents(scenario.quoteLineItems)

    return {
      min: Math.round(total * 0.98),
      avg: total,
      max: Math.round(total * 1.02),
      costSource: 'hospital_quote',
      components: comps,
      lineItems: scenario.quoteLineItems,
      stayDurationDays: stayDays,
      sourceLabel: 'Hospital Estimate Document (Verified Line Items)',
    }
  }

  // ─── Priority 2: Quoted Cost Total ──────────────────────────────────────────
  if (scenario.quotedCost && scenario.quotedCost > 0) {
    const total = scenario.quotedCost
    // Estimate standard component splits
    const comps: CostComponents = {
      room: Math.round(total * 0.20),
      surgery: Math.round(total * 0.45),
      doctor: Math.round(total * 0.15),
      medicines: Math.round(total * 0.10),
      consumables: Math.round(total * 0.05),
      diagnostics: Math.round(total * 0.05),
    }

    const syntheticLineItems: QuoteLineItem[] = [
      { id: 'qli_1', category: 'room', description: `Room Rent (${scenario.roomType}) - ${stayDays} day(s)`, quantity: stayDays, unitPrice: Math.round(comps.room / stayDays), amount: comps.room, confidence: 'high' },
      { id: 'qli_2', category: 'surgery', description: `OT & Surgical Charges (${scenario.treatment})`, quantity: 1, unitPrice: comps.surgery, amount: comps.surgery, confidence: 'high' },
      { id: 'qli_3', category: 'doctor', description: 'Surgeon & Anesthetist Consultation', quantity: 1, unitPrice: comps.doctor, amount: comps.doctor, confidence: 'high' },
      { id: 'qli_4', category: 'medicines', description: 'Inpatient Pharmacy & Medications', quantity: 1, unitPrice: comps.medicines, amount: comps.medicines, confidence: 'medium' },
      { id: 'qli_5', category: 'consumables', description: 'Surgical Consumables & PPE', quantity: 1, unitPrice: comps.consumables, amount: comps.consumables, confidence: 'medium' },
      { id: 'qli_6', category: 'diagnostics', description: 'Pre-op & Post-op Pathology/Radiology', quantity: 1, unitPrice: comps.diagnostics, amount: comps.diagnostics, confidence: 'medium' },
    ]

    return {
      min: Math.round(total * 0.95),
      avg: total,
      max: Math.round(total * 1.05),
      costSource: 'manual_quote',
      components: comps,
      lineItems: syntheticLineItems,
      stayDurationDays: stayDays,
      sourceLabel: 'User-Supplied Hospital Quoted Cost',
    }
  }

  // ─── Priority 3: ML quantile model (dynamic distribution + learned line items) ──
  if (ml) {
    return mlCostResult(scenario, ml, stayDays)
  }

  // ─── Priority 4: Structured Benchmark Dataset with stay & tier scaling ───────
  if (data) {
    const tier = getCityTier(scenario.city)
    const tierMult = getCityTierMultiplier(tier)
    const hospMult = getHospitalMultiplier(scenario.hospitalType)
    const roomMult = getRoomMultiplier(scenario.roomType)

    // Stay days scaling factor for room components
    const baseStayDays = data.typicalStayDays || 2
    const stayRatio = stayDays / baseStayDays

    // Scale room by exact stay days ratio, other components by hospital and tier
    const baseRoom = data.typicalComponents.room * stayRatio * roomMult * tierMult * hospMult
    const baseSurgery = data.typicalComponents.surgery * hospMult * tierMult
    const baseDoctor = data.typicalComponents.doctor * hospMult * tierMult
    const baseMeds = data.typicalComponents.medicines * Math.min(1.5, Math.max(0.8, (1 + (stayDays - baseStayDays) * 0.15))) * tierMult
    const baseConsumables = data.typicalComponents.consumables * Math.min(1.5, (1 + (stayDays - baseStayDays) * 0.1)) * tierMult
    const baseDiag = data.typicalComponents.diagnostics * tierMult
    const baseImplants = (data.typicalComponents.implants || 0)

    const comps: CostComponents = {
      room: Math.round(baseRoom),
      surgery: Math.round(baseSurgery),
      doctor: Math.round(baseDoctor),
      medicines: Math.round(baseMeds),
      consumables: Math.round(baseConsumables),
      diagnostics: Math.round(baseDiag),
      implants: Math.round(baseImplants),
    }

    const calculatedAvg = comps.room + comps.surgery + comps.doctor + comps.medicines + comps.consumables + comps.diagnostics + (comps.implants || 0)
    const calculatedMin = Math.round(calculatedAvg * 0.82)
    const calculatedMax = Math.round(calculatedAvg * 1.25)

    const lineItems: QuoteLineItem[] = [
      { id: 'qli_bm_1', category: 'room', description: `Room / Bed Charges (${scenario.roomType}) - ${stayDays} days`, quantity: stayDays, unitPrice: Math.round(comps.room / stayDays), amount: comps.room, confidence: 'medium' },
      { id: 'qli_bm_2', category: 'surgery', description: `Operation Theatre & Procedure Fee (${data.treatment})`, quantity: 1, unitPrice: comps.surgery, amount: comps.surgery, confidence: 'medium' },
      { id: 'qli_bm_3', category: 'doctor', description: 'Surgeon, Anesthetist & Specialist Visits', quantity: 1, unitPrice: comps.doctor, amount: comps.doctor, confidence: 'medium' },
      ...(comps.implants && comps.implants > 0 ? [{ id: 'qli_bm_imp', category: 'implant' as const, description: 'Medical Device / Implant (Capped Per Tariff)', quantity: 1, unitPrice: comps.implants, amount: comps.implants, confidence: 'medium' as const }] : []),
      { id: 'qli_bm_4', category: 'medicines', description: 'Inpatient Pharmacy & Intravenous Fluids', quantity: 1, unitPrice: comps.medicines, amount: comps.medicines, confidence: 'medium' },
      { id: 'qli_bm_5', category: 'consumables', description: 'Surgical Disposables, PPE & Dressings', quantity: 1, unitPrice: comps.consumables, amount: comps.consumables, confidence: 'medium' },
      { id: 'qli_bm_6', category: 'diagnostics', description: 'Biochemical / Imaging Investigations', quantity: 1, unitPrice: comps.diagnostics, amount: comps.diagnostics, confidence: 'medium' },
    ]

    return {
      min: calculatedMin,
      avg: calculatedAvg,
      max: calculatedMax,
      costSource: 'benchmark',
      components: comps,
      lineItems,
      stayDurationDays: stayDays,
      sourceLabel: `Benchmark Tariff (${tier} · ${scenario.hospitalType.toUpperCase()} Hospital · ${stayDays} days stay)`,
    }
  }

  // ─── Priority 5: Generic Fallback ───────────────────────────────────────────
  const fbAvg = 120000
  const fbMin = 60000
  const fbMax = 220000
  const fbComps: CostComponents = {
    room: 25000,
    surgery: 50000,
    doctor: 20000,
    medicines: 12000,
    consumables: 8000,
    diagnostics: 5000,
  }

  const fallbackItems: QuoteLineItem[] = [
    { id: 'qli_fb_1', category: 'room', description: `Estimated Room Charges (${scenario.roomType}) - ${stayDays} days`, quantity: stayDays, unitPrice: Math.round(25000 / stayDays), amount: 25000, confidence: 'low' },
    { id: 'qli_fb_2', category: 'surgery', description: `Surgical & Procedure Estimate (${scenario.treatment})`, quantity: 1, unitPrice: 50000, amount: 50000, confidence: 'low' },
    { id: 'qli_fb_3', category: 'doctor', description: 'Physician / Specialist Professional Fee', quantity: 1, unitPrice: 20000, amount: 20000, confidence: 'low' },
    { id: 'qli_fb_4', category: 'medicines', description: 'Pharmacy & Surgical Consumables', quantity: 1, unitPrice: 20000, amount: 20000, confidence: 'low' },
    { id: 'qli_fb_5', category: 'diagnostics', description: 'Lab Investigations & Diagnostics', quantity: 1, unitPrice: 5000, amount: 5000, confidence: 'low' },
  ]

  return {
    min: fbMin,
    avg: fbAvg,
    max: fbMax,
    costSource: 'synthetic',
    components: fbComps,
    lineItems: fallbackItems,
    stayDurationDays: stayDays,
    sourceLabel: 'Generic Medical Tariff Fallback (Procedure Not In Benchmark)',
  }
}

function mlCostResult(scenario: TreatmentScenario, ml: MlCostPrediction, stayDays: number): DetailedCostResult {
  const b = ml.itemizedBreakdown
  const lineConf: QuoteLineItem['confidence'] =
    ml.uncertaintyLevel === 'low' ? 'high' : ml.uncertaintyLevel === 'medium' ? 'medium' : 'low'
  const comps: CostComponents = {
    room: Math.round(b.roomAndNursing),
    surgery: Math.round(b.surgeryAndOt),
    doctor: Math.round(b.doctorFees),
    medicines: Math.round(b.medicinesAndImplants),
    consumables: Math.round(b.consumables),
    diagnostics: 0,
  }
  const lineItems: QuoteLineItem[] = [
    { id: 'qli_ml_1', category: 'room', description: `Room & Nursing (${scenario.roomType}) - ${stayDays} day(s)`, quantity: stayDays, unitPrice: Math.round(comps.room / stayDays), amount: comps.room, confidence: lineConf },
    ...(comps.surgery > 0 ? [{ id: 'qli_ml_2', category: 'surgery' as const, description: `Operation Theatre & Procedure Fee (${ml.matchedProcedure})`, quantity: 1, unitPrice: comps.surgery, amount: comps.surgery, confidence: lineConf }] : []),
    { id: 'qli_ml_3', category: 'doctor', description: 'Surgeon, Anesthetist & Specialist Fees', quantity: 1, unitPrice: comps.doctor, amount: comps.doctor, confidence: lineConf },
    { id: 'qli_ml_4', category: 'medicines', description: 'Pharmacy, Medicines & Implants', quantity: 1, unitPrice: comps.medicines, amount: comps.medicines, confidence: lineConf },
    { id: 'qli_ml_5', category: 'consumables', description: 'Medical Consumables & Disposables', quantity: 1, unitPrice: comps.consumables, amount: comps.consumables, confidence: lineConf },
  ]

  return {
    min: Math.round(ml.costP10),
    avg: Math.round(ml.costP50),
    max: Math.round(ml.costP90),
    costSource: 'ml_model',
    costModel: {
      modelVersion: ml.modelVersion,
      matchedProcedure: ml.matchedProcedure,
      confidenceScore: ml.confidenceScore,
      uncertaintyLevel: ml.uncertaintyLevel,
      drivers: ml.costDrivers,
      warnings: ml.warnings,
      extrapolated: ml.extrapolated,
    },
    components: comps,
    lineItems,
    stayDurationDays: stayDays,
    sourceLabel: `ML Cost Model v${ml.modelVersion} (P10-P90 range for ${ml.matchedProcedure}, ${stayDays} days stay)`,
  }
}

function summarizeLineItemsToComponents(items: QuoteLineItem[]): CostComponents {
  const comps: CostComponents = {
    room: 0,
    surgery: 0,
    doctor: 0,
    medicines: 0,
    consumables: 0,
    diagnostics: 0,
    implants: 0,
    ambulance: 0,
    other: 0,
  }

  for (const item of items) {
    if (item.category === 'room' || item.category === 'icu') {
      comps.room += item.amount
    } else if (item.category === 'surgery') {
      comps.surgery += item.amount
    } else if (item.category === 'doctor') {
      comps.doctor += item.amount
    } else if (item.category === 'medicines') {
      comps.medicines += item.amount
    } else if (item.category === 'consumables') {
      comps.consumables += item.amount
    } else if (item.category === 'diagnostics') {
      comps.diagnostics += item.amount
    } else if (item.category === 'implant') {
      comps.implants = (comps.implants || 0) + item.amount
    } else if (item.category === 'ambulance') {
      comps.ambulance = (comps.ambulance || 0) + item.amount
    } else {
      comps.other = (comps.other || 0) + item.amount
    }
  }

  return comps
}
