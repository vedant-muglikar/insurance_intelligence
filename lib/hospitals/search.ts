/**
 * Hospitals near a point, from OpenStreetMap through Nominatim (no API key). Nominatim's usage policy asks for at
 * most one request per second and an identifying User-Agent, so calls are serialised, spaced and cached. When the
 * live service cannot be reached, a bundled snapshot of the demo area is used instead and labelled as such.
 */

import { classifyHospital } from './classify'
import { SAVED_AREAS } from './snapshot'
import type { HospitalSearchResult, NearbyHospital, SearchCenter } from './types'

const NOMINATIM = 'https://nominatim.openstreetmap.org'
const USER_AGENT = 'BimaSetu/1.0 (hospital finder)'
const MAX_RESULTS = 40 // Nominatim's limit per request
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

export class HospitalSearchError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message)
    this.name = 'HospitalSearchError'
  }
}

// ─── Geometry ─────────────────────────────────────────────────────────────────

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180
  const dLat = (bLat - aLat) * rad
  const dLng = (bLng - aLng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

function viewbox(lat: number, lng: number, radiusKm: number): string {
  const dLat = radiusKm / 111
  const dLng = radiusKm / (111 * Math.cos((lat * Math.PI) / 180))
  return [lng - dLng, lat + dLat, lng + dLng, lat - dLat].map((n) => n.toFixed(5)).join(',')
}

// ─── Nominatim: one request at a time, at least 1.1 s apart, cached ──────────

let gate: Promise<void> = Promise.resolve()
let lastCall = 0
const cache = new Map<string, { at: number; value: unknown }>()

async function nominatim<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = `${NOMINATIM}${path}?${new URLSearchParams({ format: 'jsonv2', ...params })}`
  const hit = cache.get(url)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T

  const turn = gate.then(async () => {
    const wait = lastCall + 1100 - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastCall = Date.now()
  })
  gate = turn.catch(() => {})
  await turn

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new HospitalSearchError(`Map service returned ${res.status}`)
  const value = (await res.json()) as T
  if (cache.size > 300) cache.delete(cache.keys().next().value!)
  cache.set(url, { at: Date.now(), value })
  return value
}

interface NominatimPlace {
  place_id: number
  osm_type?: string
  osm_id?: number
  lat: string
  lon: string
  name?: string
  display_name: string
  category?: string
  type?: string
  address?: Record<string, string>
  extratags?: Record<string, string> | null
}

const district = (s?: string) => (s || '').replace(/\s+(sub)?district$/i, '').trim()

function cityOf(address: Record<string, string> = {}): { city: string; pricingCity: string } {
  // Sub-district names ("Haveli Subdistrict") mean nothing to users or to the price tiers; the district does
  const city = district(address.city || address.town || address.village || address.state_district || address.county)
  const pricingCity = [city, district(address.state_district)].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ')
  return { city, pricingCity: pricingCity || city }
}

/** "411027, Pune" or "Aundh, Pune" */
function placeLabel(address: Record<string, string> = {}, fallback: string): string {
  const { city } = cityOf(address)
  const local = address.suburb || address.neighbourhood || address.postcode
  return [local, city].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ') || fallback
}

function areaOf(address: Record<string, string> = {}): string | undefined {
  return address.suburb || address.neighbourhood || address.city_district || address.quarter || undefined
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** A pincode, area or city name to a point on the map (India only) */
export async function geocode(query: string): Promise<SearchCenter> {
  const q = query.trim()
  try {
    // A 6-digit pincode is looked up as a postcode; free text can match a same-named village elsewhere
    const where: Record<string, string> = /^\d{6}$/.test(q) ? { postalcode: q } : { q }
    const found = await nominatim<NominatimPlace[]>('/search', { ...where, countrycodes: 'in', addressdetails: '1', limit: '1' })
    const place = found[0]
    if (!place) throw new HospitalSearchError(`Could not find "${q}". Try a 6-digit pincode or an area and city, like "Aundh, Pune".`, 404)
    const { city, pricingCity } = cityOf(place.address)
    return { lat: Number(place.lat), lng: Number(place.lon), label: placeLabel(place.address, place.display_name.split(',')[0]), city, pricingCity }
  } catch (err) {
    if (err instanceof HospitalSearchError && err.status === 404) throw err
    const saved = SAVED_AREAS.find((a) => a.aliases.some((alias) => q.toLowerCase().includes(alias)))
    if (saved) return saved.center
    throw err instanceof HospitalSearchError ? err : new HospitalSearchError('The map service could not be reached. Check the internet connection and try again.')
  }
}

/** Hospitals within radiusKm of a point, nearest first */
export async function searchNearby(lat: number, lng: number, radiusKm: number, knownCenter?: SearchCenter): Promise<HospitalSearchResult> {
  try {
    const places = await nominatim<NominatimPlace[]>('/search', {
      q: 'hospital',
      viewbox: viewbox(lat, lng, radiusKm),
      bounded: '1',
      limit: String(MAX_RESULTS),
      addressdetails: '1',
      extratags: '1',
    })
    const hospitals = toHospitals(places, lat, lng, radiusKm)
    let center = knownCenter
    if (!center) {
      const fromResults = mostCommonCity(places)
      if (fromResults) {
        center = { lat, lng, label: fromResults.city, ...fromResults }
      } else {
        const here = await nominatim<NominatimPlace>('/reverse', { lat: String(lat), lon: String(lng), zoom: '12', addressdetails: '1' })
        const c = cityOf(here.address)
        center = { lat, lng, label: c.city || 'Your location', ...c }
      }
    }
    return { center, radiusKm, hospitals, source: 'live', capped: places.length >= MAX_RESULTS }
  } catch (err) {
    const saved = fromSnapshot(lat, lng, radiusKm, knownCenter)
    if (saved) return saved
    throw err instanceof HospitalSearchError ? err : new HospitalSearchError('The map service could not be reached. Check the internet connection and try again.')
  }
}

function toHospitals(places: NominatimPlace[], lat: number, lng: number, radiusKm: number): NearbyHospital[] {
  const out: NearbyHospital[] = []
  for (const p of places) {
    const tags = p.extratags ?? {}
    const isHospital = p.type === 'hospital' || tags.healthcare === 'hospital'
    const name = (p.name || '').trim()
    if (!isHospital || !name) continue
    const hLat = Number(p.lat)
    const hLng = Number(p.lon)
    const d = distanceKm(lat, lng, hLat, hLng)
    if (d > radiusKm) continue
    // The same hospital is often mapped twice (a point and its building): keep the first within 300 m
    if (out.some((h) => h.name.toLowerCase() === name.toLowerCase() && distanceKm(h.lat, h.lng, hLat, hLng) < 0.3)) continue
    const { type, source } = classifyHospital(name, tags)
    out.push({
      id: `${p.osm_type ?? 'p'}${p.osm_id ?? p.place_id}`,
      name,
      lat: hLat,
      lng: hLng,
      distanceKm: Math.round(d * 10) / 10,
      area: areaOf(p.address),
      address: p.display_name.split(',').slice(1, 4).join(',').trim() || undefined,
      phone: (tags.phone || tags['contact:phone'] || '').split(';')[0].trim() || undefined,
      website: tags.website || tags['contact:website'] || undefined,
      emergency: tags.emergency === 'yes' ? true : undefined,
      type,
      typeSource: source,
    })
  }
  return out.sort((a, b) => a.distanceKm - b.distanceKm)
}

function mostCommonCity(places: NominatimPlace[]): { city: string; pricingCity: string } | null {
  const counts = new Map<string, { n: number; v: { city: string; pricingCity: string } }>()
  for (const p of places) {
    const v = cityOf(p.address)
    if (!v.city) continue
    const e = counts.get(v.pricingCity) ?? { n: 0, v }
    e.n++
    counts.set(v.pricingCity, e)
  }
  return [...counts.values()].sort((a, b) => b.n - a.n)[0]?.v ?? null
}

function fromSnapshot(lat: number, lng: number, radiusKm: number, knownCenter?: SearchCenter): HospitalSearchResult | null {
  const area = SAVED_AREAS.find((a) => distanceKm(lat, lng, a.center.lat, a.center.lng) <= a.radiusKm + radiusKm)
  if (!area) return null
  const hospitals = area.hospitals
    .map((h) => ({ ...h, distanceKm: Math.round(distanceKm(lat, lng, h.lat, h.lng) * 10) / 10 }))
    .filter((h) => h.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
  return { center: knownCenter ?? { ...area.center, lat, lng }, radiusKm, hospitals, source: 'saved', capped: false }
}
