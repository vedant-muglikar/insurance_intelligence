'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Crosshair, Globe, MagnifyingGlass, NavigationArrow, Phone, Warning } from '@phosphor-icons/react'
import type { PolicyAnalysisResult } from '@/lib/types/policy'
import type { CoverageResult, TreatmentScenario } from '@/lib/types/estimate'
import type { HospitalSearchResult, HospitalType, HospitalTypeSource } from '@/lib/hospitals/types'
import { defaultScenario } from '@/lib/estimate/defaults'
import { evaluatePolicyPreflight } from '@/lib/estimate/policy'
import { fetchMlCostPrediction } from '@/lib/estimate/mlClient'
import { isDemoPolicy } from '@/lib/demo/preset'
import { formatINR } from '@/lib/policy/normalizers'
import { HospitalMap, type MappedHospital } from './HospitalMap'
import './hospitals.css'

const TYPES: HospitalType[] = ['public', 'private', 'corporate']

const TYPE_LABEL: Record<HospitalType, string> = {
  public: 'Government',
  private: 'Private',
  corporate: 'Corporate',
}

const TYPE_HINT: Record<HospitalType, string> = {
  public: 'Government and municipal hospitals',
  private: 'Private hospitals and nursing homes',
  corporate: 'Large hospital chains',
}

const TYPE_SOURCE: Record<HospitalTypeSource, string> = {
  osm_tag: 'from the map listing',
  name: 'from its name',
  assumed: 'assumed: the map does not say who runs it',
}

const ROOM_LABEL: Record<TreatmentScenario['roomType'], string> = {
  general: 'general ward',
  'twin-sharing': 'twin-sharing room',
  'single-private': 'single private room',
  suite: 'deluxe suite',
  icu: 'ICU',
}

const COST_SOURCE: Record<string, string> = {
  ml_model: 'the cost model',
  benchmark: 'benchmark prices',
  synthetic: 'a rough guide',
}

const RADII = [2, 5, 10]

type Status = 'idle' | 'locating' | 'searching' | 'ready' | 'error'

interface HospitalsNearbyProps {
  policy: PolicyAnalysisResult
  /** The stay from the Estimator; its defaults when the Estimator has not been opened */
  scenario?: TreatmentScenario | null
  onOpenEstimator: () => void
}

function locationError(err: GeolocationPositionError): string {
  if (err.code === err.PERMISSION_DENIED) return 'Location permission is blocked. Allow it from the address bar, or search by pincode instead.'
  if (err.code === err.TIMEOUT) return 'Finding your location took too long. Try again, or search by pincode.'
  return 'Your location is not available right now. Search by pincode instead.'
}

export function HospitalsNearby({ policy, scenario, onOpenEstimator }: HospitalsNearbyProps) {
  const [query, setQuery] = useState(() => (isDemoPolicy(policy) ? '411027' : ''))
  const [radius, setRadius] = useState(5)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<HospitalSearchResult | null>(null)
  const [lastSearch, setLastSearch] = useState<Record<string, string> | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<HospitalType | 'all'>('all')
  const [sort, setSort] = useState<'distance' | 'cost'>('distance')
  const [overrides, setOverrides] = useState<Record<string, HospitalType>>({})
  const [prices, setPrices] = useState<Partial<Record<HospitalType, CoverageResult>>>({})
  const [pricing, setPricing] = useState<'idle' | 'loading' | 'ready'>('idle')
  const itemRefs = useRef(new Map<string, HTMLLIElement>())

  // The stay being priced, without any hospital quote: here the bill is predicted per type of hospital
  const stay = useMemo<TreatmentScenario>(() => {
    const s = { ...(scenario ?? defaultScenario(policy)) }
    delete s.quoteLineItems
    delete s.quotedCost
    return s
  }, [scenario, policy])
  const stayKey = JSON.stringify(stay)

  async function search(params: Record<string, string>) {
    setStatus('searching')
    setError(null)
    setLastSearch(params)
    try {
      const res = await fetch(`/api/hospitals/nearby?${new URLSearchParams({ ...params, radius: String(radius) })}`)
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Could not search for hospitals.')
      setResult(json.data)
      setSelectedId(null)
      setOverrides({})
      setStatus('ready')
    } catch (err) {
      setError((err as Error).message)
      setStatus('error')
    }
  }

  function useMyLocation() {
    setError(null)
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setError('Your browser only shares location on a secure (https) page. Search by pincode instead.')
      setStatus('error')
      return
    }
    if (!('geolocation' in navigator)) {
      setError('This browser cannot share its location. Search by pincode instead.')
      setStatus('error')
      return
    }
    setStatus('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => void search({ lat: pos.coords.latitude.toFixed(5), lng: pos.coords.longitude.toFixed(5) }),
      (err) => {
        setError(locationError(err))
        setStatus('error')
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    )
  }

  // A new radius re-runs the last search
  const firstRadius = useRef(true)
  useEffect(() => {
    if (firstRadius.current) {
      firstRadius.current = false
      return
    }
    if (lastSearch) void search(lastSearch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radius])

  // Price the stay at each type of hospital in this city: cost model per type, then the claim engine
  const pricingCity = result?.center.pricingCity
  useEffect(() => {
    if (!pricingCity) return
    const controller = new AbortController()
    setPricing('loading')
    Promise.all(
      TYPES.map(async (t) => {
        const s: TreatmentScenario = { ...stay, hospitalType: t, city: pricingCity }
        const ml = await fetchMlCostPrediction(s, controller.signal)
        return [t, evaluatePolicyPreflight(s, policy, { mlPrediction: ml })] as const
      }),
    ).then((entries) => {
      if (controller.signal.aborted) return
      setPrices(Object.fromEntries(entries))
      setPricing('ready')
    })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricingCity, stayKey, policy])

  const hospitals = useMemo<MappedHospital[]>(
    () => (result?.hospitals ?? []).map((h) => ({ ...h, effectiveType: overrides[h.id] ?? h.type })),
    [result, overrides],
  )
  const counts = useMemo(() => {
    const c: Record<HospitalType, number> = { public: 0, private: 0, corporate: 0 }
    for (const h of hospitals) c[h.effectiveType]++
    return c
  }, [hospitals])
  // The type filter applies to the map pins and the list alike
  const onMap = useMemo(() => (filter === 'all' ? hospitals : hospitals.filter((h) => h.effectiveType === filter)), [hospitals, filter])
  const listed = useMemo(() => {
    const shown = onMap
    if (sort === 'distance') return shown
    const cost = (h: MappedHospital) => prices[h.effectiveType]?.patientShare.typical ?? Infinity
    return [...shown].sort((a, b) => cost(a) - cost(b) || a.distanceKm - b.distanceKm)
  }, [onMap, sort, prices])

  const select = (id: string) => {
    setSelectedId(id)
    requestAnimationFrame(() => itemRefs.current.get(id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
  }

  const busy = status === 'locating' || status === 'searching'
  const anyPrice = prices.private ?? prices.public ?? prices.corporate

  return (
    <div className="db-stack hn">
      {/* ── where ─────────────────────────────────────────── */}
      <section className="db-card">
        <div className="db-card-head">
          <div>
            <h2 className="db-card-title">Find hospitals</h2>
            <p className="db-card-sub">
              Use your location or search a pincode. Your location is used for this search only and is not saved.
            </p>
          </div>
        </div>
        <form
          className="hn-search"
          onSubmit={(e) => {
            e.preventDefault()
            if (query.trim()) void search({ q: query.trim() })
          }}
        >
          <button type="button" className="db-btn db-btn-primary" onClick={useMyLocation} disabled={busy}>
            <Crosshair size={18} weight="bold" aria-hidden />
            {status === 'locating' ? 'Finding you…' : 'Use my location'}
          </button>
          <span className="hn-or">or</span>
          <label className="hn-query">
            <span className="sr-only">Pincode or area</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pincode or area, e.g. 411027 or Aundh, Pune" inputMode="search" />
          </label>
          <button type="submit" className="db-btn db-btn-ghost" disabled={busy || !query.trim()}>
            <MagnifyingGlass size={18} weight="bold" aria-hidden />
            {status === 'searching' ? 'Searching…' : 'Search'}
          </button>
          <label className="hn-radius-pick">
            <span>Within</span>
            <select value={radius} onChange={(e) => setRadius(Number(e.target.value))} disabled={busy}>
              {RADII.map((r) => (
                <option key={r} value={r}>
                  {r} km
                </option>
              ))}
            </select>
          </label>
        </form>
        {error && (
          <p className="db-banner hn-error" role="alert">
            <Warning size={18} weight="bold" aria-hidden /> {error}
          </p>
        )}
      </section>

      {/* ── what a stay costs, by type of hospital ─────────── */}
      <section className="db-card">
        <div className="db-card-head">
          <div>
            <h2 className="db-card-title">What this stay costs by type of hospital</h2>
            <p className="db-card-sub">
              {stay.treatment}, age {stay.age}, {ROOM_LABEL[stay.roomType]}, {stay.stayDurationDays} day{stay.stayDurationDays === 1 ? '' : 's'}
              {result ? ` in ${result.center.city || result.center.label}` : ''}.{' '}
              <button type="button" className="hn-link" onClick={onOpenEstimator}>
                Change the stay in the Estimator
              </button>
            </p>
          </div>
        </div>

        {!result ? (
          <p className="hn-wait">Search for hospitals to see prices for your area.</p>
        ) : (
          <div className="hn-types">
            {TYPES.map((t) => {
              const p = prices[t]
              const active = filter === t
              return (
                <button
                  key={t}
                  type="button"
                  className="hn-type"
                  data-type={t}
                  aria-pressed={active}
                  onClick={() => setFilter(active ? 'all' : t)}
                >
                  <span className="hn-type-head">
                    <i className="hn-dot" data-type={t} aria-hidden />
                    {TYPE_LABEL[t]}
                    <span className="hn-type-count">{counts[t]} nearby</span>
                  </span>
                  <span className="hn-type-label">You would pay about</span>
                  <span className="hn-type-value">{p ? formatINR(p.patientShare.typical) : pricing === 'loading' ? '…' : '—'}</span>
                  <span className="hn-type-sub">
                    {p ? (
                      <>
                        Bill about {formatINR(p.treatmentCost.typical)} · insurer pays {formatINR(p.potentiallyCovered.typical)}
                      </>
                    ) : (
                      TYPE_HINT[t]
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        )}
        {result && anyPrice && (
          <p className="db-fine">
            Estimated for a typical government, private or corporate hospital in {result.center.city || 'this city'} from{' '}
            {COST_SOURCE[anyPrice.costSource] ?? 'the cost model'}, with your policy&rsquo;s limits applied by the same engine as the Estimator and
            Claim ledger. These are not a hospital&rsquo;s own prices: ask the hospital for a quote and add it in the Estimator for an exact figure.
          </p>
        )}
      </section>

      {/* ── map and list ──────────────────────────────────── */}
      {result && (
        <section className="db-card">
          <div className="db-card-head">
            <div>
              <h2 className="db-card-title">
                {hospitals.length} hospital{hospitals.length === 1 ? '' : 's'} within {result.radiusKm} km of {result.center.label}
              </h2>
              <p className="db-card-sub">
                Pins are coloured by type. Pick a hospital on the map or in the list to see its estimate.
              </p>
            </div>
            <div className="hn-tools">
              <label className="hn-radius-pick">
                <span>Sort</span>
                <select value={sort} onChange={(e) => setSort(e.target.value as 'distance' | 'cost')}>
                  <option value="distance">Nearest first</option>
                  <option value="cost">Cheapest for you</option>
                </select>
              </label>
            </div>
          </div>

          {result.source === 'saved' && (
            <p className="db-banner hn-error">
              <Warning size={18} weight="bold" aria-hidden /> The live map search is unavailable, so this is a saved list of hospitals for this area.
            </p>
          )}

          <div className="hn-filters" role="group" aria-label="Show hospitals of type">
            {(['all', ...TYPES] as const).map((t) => (
              <button key={t} type="button" className="hn-filter" aria-pressed={filter === t} onClick={() => setFilter(t)}>
                {t !== 'all' && <i className="hn-dot" data-type={t} aria-hidden />}
                {t === 'all' ? `All (${hospitals.length})` : `${TYPE_LABEL[t]} (${counts[t]})`}
              </button>
            ))}
          </div>

          <div className="hn-layout">
            <HospitalMap center={result.center} radiusKm={result.radiusKm} hospitals={onMap} selectedId={selectedId} onSelect={select} />

            <ul className="hn-list" aria-label="Hospitals">
              {listed.length === 0 && (
                <li className="hn-none">
                  {hospitals.length === 0 ? 'No hospitals found here. Try a larger radius or another pincode.' : 'No hospitals of this type nearby.'}
                </li>
              )}
              {listed.map((h) => {
                const p = prices[h.effectiveType]
                const open = h.id === selectedId
                return (
                  <li
                    key={h.id}
                    ref={(node) => {
                      if (node) itemRefs.current.set(h.id, node)
                      else itemRefs.current.delete(h.id)
                    }}
                    className="hn-item"
                    data-open={open || undefined}
                  >
                    <button type="button" className="hn-item-main" onClick={() => (open ? setSelectedId(null) : select(h.id))} aria-expanded={open}>
                      <i className="hn-dot" data-type={h.effectiveType} aria-hidden />
                      <span className="hn-item-text">
                        <b>{h.name}</b>
                        <span>
                          {h.distanceKm} km{h.area ? ` · ${h.area}` : ''} · {TYPE_LABEL[h.effectiveType]}
                          {h.emergency ? ' · Emergency' : ''}
                        </span>
                      </span>
                      <span className="hn-item-price">
                        <b>{p ? formatINR(p.patientShare.typical) : '…'}</b>
                        <small>you pay</small>
                      </span>
                    </button>

                    {open && (
                      <div className="hn-item-more">
                        <dl className="hn-figures">
                          <div>
                            <dt>Estimated bill</dt>
                            <dd>{p ? formatINR(p.treatmentCost.typical) : '…'}</dd>
                          </div>
                          <div>
                            <dt>Insurer pays</dt>
                            <dd className="hn-ok">{p ? formatINR(p.potentiallyCovered.typical) : '…'}</dd>
                          </div>
                          <div>
                            <dt>You pay</dt>
                            <dd>
                              {p ? formatINR(p.patientShare.typical) : '…'}
                              {p && p.patientShare.min !== p.patientShare.max && (
                                <small>
                                  {formatINR(p.patientShare.min)} to {formatINR(p.patientShare.max)}
                                </small>
                              )}
                            </dd>
                          </div>
                        </dl>
                        <label className="hn-type-pick">
                          <span>Priced as</span>
                          <select
                            value={h.effectiveType}
                            onChange={(e) => setOverrides((o) => ({ ...o, [h.id]: e.target.value as HospitalType }))}
                          >
                            {TYPES.map((t) => (
                              <option key={t} value={t}>
                                {TYPE_LABEL[t]} hospital
                              </option>
                            ))}
                          </select>
                          <small>{overrides[h.id] ? 'changed by you' : TYPE_SOURCE[h.typeSource]}</small>
                        </label>
                        <div className="hn-links">
                          <a href={`https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}`} target="_blank" rel="noreferrer">
                            <NavigationArrow size={16} weight="bold" aria-hidden /> Directions
                          </a>
                          {h.phone && (
                            <a href={`tel:${h.phone.replace(/[^\d+]/g, '')}`}>
                              <Phone size={16} weight="bold" aria-hidden /> {h.phone}
                            </a>
                          )}
                          {h.website && (
                            <a href={h.website} target="_blank" rel="noreferrer">
                              <Globe size={16} weight="bold" aria-hidden /> Website
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>

          <p className="db-fine">
            {result.capped ? 'The map service returns up to 40 hospitals per search; a smaller radius shows the closest ones. ' : ''}
            Hospital locations &copy; OpenStreetMap contributors. Whether a hospital is in your insurer&rsquo;s cashless network is not checked here.
          </p>
        </section>
      )}

      {status === 'idle' && !result && isDemoPolicy(policy) && (
        <p className="db-fine">Demo: 411027 (Sangvi, Pune) is the policyholder&rsquo;s pincode in the policy schedule.</p>
      )}
    </div>
  )
}
