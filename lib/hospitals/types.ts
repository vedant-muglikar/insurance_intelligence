// ─── Hospitals near you ─────────────────────────────────────────────────────

/** Same three tiers the cost model prices by (TreatmentScenario.hospitalType) */
export type HospitalType = 'public' | 'private' | 'corporate'

/** How the type was decided: an OpenStreetMap tag, the hospital's name, or nothing (assumed private) */
export type HospitalTypeSource = 'osm_tag' | 'name' | 'assumed'

export interface NearbyHospital {
  id: string
  name: string
  lat: number
  lng: number
  distanceKm: number
  area?: string
  address?: string
  phone?: string
  website?: string
  emergency?: boolean
  type: HospitalType
  typeSource: HospitalTypeSource
}

export interface SearchCenter {
  lat: number
  lng: number
  /** Short place name shown to the user */
  label: string
  /** City or town name */
  city: string
  /** City plus district, so the cost model's city tier recognises suburbs (e.g. "Pimpri-Chinchwad, Pune") */
  pricingCity: string
}

export interface HospitalSearchResult {
  center: SearchCenter
  radiusKm: number
  hospitals: NearbyHospital[]
  /** live: OpenStreetMap just now; saved: the bundled snapshot, used when the live service is unreachable */
  source: 'live' | 'saved'
  /** The live search returns at most 40 hospitals; more may exist in the area */
  capped: boolean
}
