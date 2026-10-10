/**
 * Hospitals around the demo policyholder's address (Sangvi, Pune 411027), saved from OpenStreetMap so the feature
 * still works when the live map service cannot be reached. Data © OpenStreetMap contributors (ODbL).
 * Regenerate: npx tsx scripts/saveHospitalSnapshot.ts
 */

import type { NearbyHospital, SearchCenter } from './types'
import pune from './snapshot-pune.json'

export interface SavedArea {
  center: SearchCenter
  radiusKm: number
  /** Searches that should land on this area when the geocoder is unreachable */
  aliases: string[]
  savedOn: string
  hospitals: NearbyHospital[]
}

export const SAVED_AREAS: SavedArea[] = [pune as SavedArea]
