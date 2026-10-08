/**
 * ClaimLens - Benchmark Treatment Dataset (Blueprint Section 9)
 * Curated 16-procedure benchmark covering Tier 1, 2, and 3 cities in India
 * with component-level pricing (Room, Surgery, Doctor, Medicines, Implants, Consumables, Diagnostics)
 * and stay-day scaling.
 */

import { TreatmentCostData } from '../types/estimate'

export const EXPANDED_COST_DATASET: TreatmentCostData[] = [
  {
    id: 'proc_1',
    treatment: 'Appendectomy (Laparoscopic)',
    categoryKey: 'appendectomy',
    synonyms: ['appendix', 'appendicitis', 'lap appendectomy', 'appendix removal'],
    cityTier: 'Tier 1',
    hospitalType: 'private',
    roomType: 'single-private',
    typicalStayDays: 2,
    minCost: 75000,
    avgCost: 115000,
    maxCost: 160000,
    typicalComponents: {
      room: 16000,      // ₹8,000 / day x 2
      surgery: 50000,
      doctor: 22000,
      medicines: 12000,
      consumables: 7000,
      diagnostics: 8000,
    },
  },
  {
    id: 'proc_2',
    treatment: 'Total Knee Replacement (Unilateral)',
    categoryKey: 'knee_replacement',
    synonyms: ['knee surgery', 'tkr', 'knee arthroplasty', 'knee replacement', 'joint replacement'],
    cityTier: 'Tier 1',
    hospitalType: 'corporate',
    roomType: 'single-private',
    typicalStayDays: 4,
    minCost: 260000,
    avgCost: 335000,
    maxCost: 420000,
    typicalComponents: {
      room: 36000,     // ₹9,000 / day x 4
      surgery: 120000,
      doctor: 45000,
      medicines: 25000,
      implants: 75000,
      consumables: 20000,
      diagnostics: 14000,
    },
  },
  {
    id: 'proc_3',
    treatment: 'Cataract Surgery (Phacoemulsification with Foldable IOL)',
    categoryKey: 'cataract',
    synonyms: ['cataract', 'phaco', 'eye lens', 'eye surgery', 'cataract operation', 'iol'],
    cityTier: 'Tier 1',
    hospitalType: 'private',
    roomType: 'general',
    typicalStayDays: 1, // Day care
    minCost: 32000,
    avgCost: 48000,
    maxCost: 68000,
    typicalComponents: {
      room: 4000,
      surgery: 24000,
      doctor: 7000,
      implants: 8000,
      medicines: 3000,
      consumables: 1500,
      diagnostics: 500,
    },
  },
  {
    id: 'proc_4',
    treatment: 'Maternity (Normal Delivery)',
    categoryKey: 'maternity_normal',
    synonyms: ['maternity', 'normal delivery', 'childbirth', 'vaginal delivery', 'delivery'],
    cityTier: 'Tier 1',
    hospitalType: 'private',
    roomType: 'twin-sharing',
    typicalStayDays: 3,
    minCost: 55000,
    avgCost: 80000,
    maxCost: 110000,
    typicalComponents: {
      room: 18000,     // ₹6,000 / day x 3
      surgery: 32000,
      doctor: 16000,
      medicines: 6000,
      consumables: 4000,
      diagnostics: 4000,
    },
  },
  {
    id: 'proc_5',
    treatment: 'Maternity (Cesarean Section / C-Section)',
    categoryKey: 'maternity_csection',
    synonyms: ['c-section', 'caesarean', 'cesarean delivery', 'lscs'],
    cityTier: 'Tier 1',
    hospitalType: 'private',
    roomType: 'single-private',
    typicalStayDays: 4,
    minCost: 85000,
    avgCost: 125000,
    maxCost: 175000,
    typicalComponents: {
      room: 32000,     // ₹8,000 / day x 4
      surgery: 52000,
      doctor: 22000,
      medicines: 9000,
      consumables: 5000,
      diagnostics: 5000,
    },
  },
  {
    id: 'proc_6',
    treatment: 'Coronary Angioplasty (PTCA with 1 DES Stent)',
    categoryKey: 'angioplasty',
    synonyms: ['angioplasty', 'ptca', 'heart stent', 'coronary stent', 'cardiac stent', 'stenting'],
    cityTier: 'Tier 1',
    hospitalType: 'corporate',
    roomType: 'single-private',
    typicalStayDays: 3,
    minCost: 190000,
    avgCost: 260000,
    maxCost: 350000,
    typicalComponents: {
      room: 35000,     // ICU + room
      surgery: 110000,
      doctor: 40000,
      implants: 38000, // DES Stent capped per NPPA
      medicines: 20000,
      consumables: 10000,
      diagnostics: 7000,
    },
  },
  {
    id: 'proc_7',
    treatment: 'Coronary Artery Bypass Graft (CABG)',
    categoryKey: 'cabg',
    synonyms: ['bypass surgery', 'open heart', 'heart bypass', 'cabg'],
    cityTier: 'Tier 1',
    hospitalType: 'corporate',
    roomType: 'single-private',
    typicalStayDays: 7,
    minCost: 380000,
    avgCost: 490000,
    maxCost: 680000,
    typicalComponents: {
      room: 84000,     // 3 days ICU + 4 days single
      surgery: 220000,
      doctor: 85000,
      medicines: 50000,
      consumables: 30000,
      diagnostics: 21000,
    },
  },
  {
    id: 'proc_8',
    treatment: 'Laparoscopic Cholecystectomy (Gallbladder Removal)',
    categoryKey: 'cholecystectomy',
    synonyms: ['gallbladder', 'gall stones', 'lap chole', 'cholecystitis'],
    cityTier: 'Tier 1',
    hospitalType: 'private',
    roomType: 'single-private',
    typicalStayDays: 2,
    minCost: 80000,
    avgCost: 118000,
    maxCost: 165000,
    typicalComponents: {
      room: 16000,
      surgery: 58000,
      doctor: 22000,
      medicines: 11000,
      consumables: 6000,
      diagnostics: 5000,
    },
  },
  {
    id: 'proc_9',
    treatment: 'Hernia Repair (Laparoscopic with Mesh)',
    categoryKey: 'hernia_repair',
    synonyms: ['hernia', 'inguinal hernia', 'umbilical hernia', 'hernioplasty', 'hernia mesh'],
    cityTier: 'Tier 1',
    hospitalType: 'private',
    roomType: 'twin-sharing',
    typicalStayDays: 2,
    minCost: 65000,
    avgCost: 95000,
    maxCost: 135000,
    typicalComponents: {
      room: 14000,
      surgery: 45000,
      doctor: 18000,
      implants: 8000,
      medicines: 5000,
      consumables: 3000,
      diagnostics: 2000,
    },
  },
  {
    id: 'proc_10',
    treatment: 'Total Hip Replacement',
    categoryKey: 'hip_replacement',
    synonyms: ['hip replacement', 'thr', 'hip surgery', 'hip arthroplasty'],
    cityTier: 'Tier 1',
    hospitalType: 'corporate',
    roomType: 'single-private',
    typicalStayDays: 5,
    minCost: 280000,
    avgCost: 360000,
    maxCost: 460000,
    typicalComponents: {
      room: 45000,
      surgery: 135000,
      doctor: 50000,
      implants: 80000,
      medicines: 25000,
      consumables: 15000,
      diagnostics: 10000,
    },
  },
  {
    id: 'proc_11',
    treatment: 'Kidney Stone Removal (PCNL / Laser URSL)',
    categoryKey: 'kidney_stone',
    synonyms: ['kidney stone', 'renal calculi', 'ursl', 'pcnl', 'lithotripsy', 'stone laser'],
    cityTier: 'Tier 1',
    hospitalType: 'private',
    roomType: 'single-private',
    typicalStayDays: 2,
    minCost: 70000,
    avgCost: 102000,
    maxCost: 145000,
    typicalComponents: {
      room: 16000,
      surgery: 52000,
      doctor: 18000,
      medicines: 8000,
      consumables: 5000,
      diagnostics: 3000,
    },
  },
  {
    id: 'proc_12',
    treatment: 'Tonsillectomy (Coblation / Laser)',
    categoryKey: 'tonsillectomy',
    synonyms: ['tonsils', 'tonsil removal', 'adenoids', 'ent surgery', 'tonsillitis'],
    cityTier: 'Tier 1',
    hospitalType: 'private',
    roomType: 'twin-sharing',
    typicalStayDays: 1,
    minCost: 35000,
    avgCost: 52000,
    maxCost: 75000,
    typicalComponents: {
      room: 7000,
      surgery: 26000,
      doctor: 10000,
      medicines: 4000,
      consumables: 3000,
      diagnostics: 2000,
    },
  },
  {
    id: 'proc_13',
    treatment: 'Total Laparoscopic Hysterectomy (TLH)',
    categoryKey: 'hysterectomy',
    synonyms: ['uterus removal', 'hysterectomy', 'fibroids uterus', 'lap hysterectomy'],
    cityTier: 'Tier 1',
    hospitalType: 'private',
    roomType: 'single-private',
    typicalStayDays: 3,
    minCost: 95000,
    avgCost: 138000,
    maxCost: 190000,
    typicalComponents: {
      room: 24000,
      surgery: 68000,
      doctor: 24000,
      medicines: 11000,
      consumables: 6000,
      diagnostics: 5000,
    },
  },
  {
    id: 'proc_14',
    treatment: 'Dengue Inpatient Management',
    categoryKey: 'dengue_treatment',
    synonyms: ['dengue', 'dengue fever', 'platelet', 'fever admission', 'viral inpatient'],
    cityTier: 'Tier 1',
    hospitalType: 'private',
    roomType: 'single-private',
    typicalStayDays: 4,
    minCost: 45000,
    avgCost: 70000,
    maxCost: 105000,
    typicalComponents: {
      room: 28000,
      surgery: 0,
      doctor: 16000,
      medicines: 12000,
      consumables: 6000,
      diagnostics: 8000,
    },
  },
  {
    id: 'proc_15',
    treatment: 'Hemodialysis (Single Session)',
    categoryKey: 'hemodialysis',
    synonyms: ['dialysis', 'kidney dialysis', 'renal dialysis'],
    cityTier: 'Tier 1',
    hospitalType: 'private',
    roomType: 'general',
    typicalStayDays: 1,
    minCost: 2500,
    avgCost: 4200,
    maxCost: 6500,
    typicalComponents: {
      room: 1000,
      surgery: 0,
      doctor: 1200,
      medicines: 800,
      consumables: 900,
      diagnostics: 300,
    },
  },
  {
    id: 'proc_16',
    treatment: 'Chemotherapy Infusion Cycle',
    categoryKey: 'chemotherapy',
    synonyms: ['chemo', 'cancer chemotherapy', 'chemo infusion', 'oncology chemo'],
    cityTier: 'Tier 1',
    hospitalType: 'corporate',
    roomType: 'daycare',
    typicalStayDays: 1,
    minCost: 40000,
    avgCost: 75000,
    maxCost: 130000,
    typicalComponents: {
      room: 5000,
      surgery: 0,
      doctor: 12000,
      medicines: 50000,
      consumables: 4000,
      diagnostics: 4000,
    },
  },
]

// Keep MOCK_COST_DATASET for backwards compatibility
export const MOCK_COST_DATASET = EXPANDED_COST_DATASET

export function getCityTier(city: string): 'Tier 1' | 'Tier 2' | 'Tier 3' {
  if (!city) return 'Tier 2'
  const clean = city.toLowerCase().trim()
  const tier1Cities = ['mumbai', 'delhi', 'new delhi', 'bangalore', 'bengaluru', 'chennai', 'hyderabad', 'kolkata', 'pune', 'gurugram', 'noida']
  const tier2Cities = ['ahmedabad', 'jaipur', 'lucknow', 'chandigarh', 'indore', 'kochi', 'coimbatore', 'nagpur', 'bhopal', 'patna', 'vadodara', 'surat', 'visakhapatnam', 'mysore']

  if (tier1Cities.some(c => clean.includes(c))) return 'Tier 1'
  if (tier2Cities.some(c => clean.includes(c))) return 'Tier 2'
  return 'Tier 3'
}

export function getCityTierMultiplier(tier: 'Tier 1' | 'Tier 2' | 'Tier 3'): number {
  switch (tier) {
    case 'Tier 1': return 1.0
    case 'Tier 2': return 0.80
    case 'Tier 3': return 0.65
  }
}

export function getHospitalMultiplier(type: 'public' | 'private' | 'corporate'): number {
  switch (type) {
    case 'public': return 0.45
    case 'private': return 1.0
    case 'corporate': return 1.25
  }
}

export function getRoomMultiplier(room: 'general' | 'twin-sharing' | 'single-private' | 'suite' | 'icu'): number {
  switch (room) {
    case 'general': return 0.75
    case 'twin-sharing': return 0.88
    case 'single-private': return 1.0
    case 'suite': return 1.45
    case 'icu': return 1.60
  }
}
