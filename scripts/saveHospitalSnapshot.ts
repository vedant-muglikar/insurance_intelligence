/**
 * Saves the hospitals around the demo policyholder's address as a fallback for when the live map service is down.
 * Run: npx tsx scripts/saveHospitalSnapshot.ts
 */

import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { geocode, searchNearby } from '../lib/hospitals/search'

const RADIUS_KM = 8

async function main() {
  const center = await geocode('411027')
  const result = await searchNearby(center.lat, center.lng, RADIUS_KM, center)
  if (result.source !== 'live') throw new Error('Live search failed; not overwriting the snapshot with saved data')
  const out = {
    center: result.center,
    radiusKm: RADIUS_KM,
    aliases: ['411027', 'sangvi', 'sangavi'],
    savedOn: new Date().toISOString().slice(0, 10),
    hospitals: result.hospitals,
  }
  const file = path.join(__dirname, '..', 'lib', 'hospitals', 'snapshot-pune.json')
  writeFileSync(file, JSON.stringify(out, null, 1) + '\n')
  console.log(`Saved ${out.hospitals.length} hospitals around ${center.label} (${center.pricingCity}) to ${file}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
