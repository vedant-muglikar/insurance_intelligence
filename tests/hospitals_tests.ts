/**
 * Hospitals near you: hospital-type classification (the price tier each hospital is shown with), distance maths,
 * and the saved snapshot used when the live map service is unreachable. Offline; no network calls.
 * Run: npx tsx tests/hospitals_tests.ts
 */

import { classifyHospital } from '../lib/hospitals/classify'
import { distanceKm } from '../lib/hospitals/search'
import { SAVED_AREAS } from '../lib/hospitals/snapshot'

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  PASS ${name}`)
  } else {
    failed++
    console.log(`  FAIL ${name}`, detail !== undefined ? JSON.stringify(detail) : '')
  }
}

console.log('\n1. Hospital type')
const t = (name: string, tags?: Record<string, string>) => classifyHospital(name, tags)
check('municipal hospital is government', t('PCMC-Yashwantrao Chavan Memorial Hospital').type === 'public')
check('cantonment hospital is government', t('Dr. Babasaheb Ambedkar Cantonment General Hospital').type === 'public')
check('ESIC hospital is government', t('ESIC Hospital Bibvewadi').type === 'public')
check('an operator:type tag decides first', t('Talera Hospital', { 'operator:type': 'government' }).source === 'osm_tag')
check('a chain is corporate', t('Aditya Birla Memorial Hospital').type === 'corporate' && t('Jupiter Hospital').type === 'corporate')
check('a brand must start the name ("Golden Care Hospital" is not CARE Hospitals)', t('Golden Care Hospital').type === 'private')
check('AIMS (private) is not AIIMS (government)', t('AIMS Hospital').type === 'private')
check('anything else is private, and says it was assumed', JSON.stringify(t('Shree Shakti Hospital')) === JSON.stringify({ type: 'private', source: 'assumed' }))

console.log('\n2. Distance')
const pune = [18.5204, 73.8567] as const
const mumbai = [19.076, 72.8777] as const
const d = distanceKm(pune[0], pune[1], mumbai[0], mumbai[1])
check(`Pune to Mumbai is about 120 km as the crow flies (${d.toFixed(1)})`, d > 115 && d < 125)
check('a point is 0 km from itself', distanceKm(pune[0], pune[1], pune[0], pune[1]) === 0)

console.log('\n3. Saved snapshot (offline fallback)')
const area = SAVED_AREAS[0]
check('the demo area is saved with its pincode as an alias', !!area && area.aliases.includes('411027'))
check('it is priced as Pune (tier-1 city)', /pune/i.test(area.center.pricingCity))
check('it holds hospitals of every type', ['public', 'private', 'corporate'].every((ty) => area.hospitals.some((h) => h.type === ty)), area.hospitals.length)
check('every saved hospital lies within the saved radius', area.hospitals.every((h) => distanceKm(area.center.lat, area.center.lng, h.lat, h.lng) <= area.radiusKm + 0.05))

console.log(`\n${failed === 0 ? 'ALL' : 'SOME'} HOSPITAL TESTS: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
