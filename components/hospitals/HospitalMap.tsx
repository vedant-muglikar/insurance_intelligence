'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import type { CircleMarker, LayerGroup, Map as LeafletMap } from 'leaflet'
import type { HospitalType, NearbyHospital } from '@/lib/hospitals/types'

export type MappedHospital = NearbyHospital & { effectiveType: HospitalType }

interface HospitalMapProps {
  center: { lat: number; lng: number; label: string }
  radiusKm: number
  hospitals: MappedHospital[]
  selectedId: string | null
  onSelect: (id: string) => void
}

/** OpenStreetMap tiles through Leaflet (no API key). Leaflet touches `window`, so it is loaded in the browser only. */
export function HospitalMap({ center, radiusKm, hospitals, selectedId, onSelect }: HospitalMapProps) {
  const el = useRef<HTMLDivElement>(null)
  const lib = useRef<typeof import('leaflet') | null>(null)
  const map = useRef<LeafletMap | null>(null)
  const layer = useRef<LayerGroup | null>(null)
  const markers = useRef(new Map<string, CircleMarker>())
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    import('leaflet').then((mod) => {
      if (cancelled || !el.current) return
      const L = ((mod as { default?: typeof import('leaflet') }).default ?? mod) as typeof import('leaflet')
      lib.current = L
      const m = L.map(el.current, { scrollWheelZoom: false })
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
      }).addTo(m)
      layer.current = L.layerGroup().addTo(m)
      map.current = m
      setReady(true)
    })
    return () => {
      cancelled = true
      map.current?.remove()
      map.current = null
      layer.current = null
      markers.current.clear()
    }
  }, [])

  // Redraw the search area and pins when the results change
  useEffect(() => {
    const L = lib.current
    const m = map.current
    const g = layer.current
    if (!ready || !L || !m || !g) return
    g.clearLayers()
    markers.current.clear()
    // Leaflet attaches layers only once the map has a view, so centre it before drawing or measuring anything
    m.setView([center.lat, center.lng], 13)
    const area = L.circle([center.lat, center.lng], { radius: radiusKm * 1000, className: 'hn-radius', interactive: false }).addTo(g)
    L.circleMarker([center.lat, center.lng], { radius: 8, className: 'hn-you' }).bindTooltip(center.label || 'Search centre', { direction: 'top', offset: [0, -8] }).addTo(g)
    for (const h of hospitals) {
      const marker = L.circleMarker([h.lat, h.lng], { radius: 7, className: `hn-pin hn-pin--${h.effectiveType}`, bubblingMouseEvents: false })
        .bindTooltip(h.name, { direction: 'top', offset: [0, -7] })
        .on('click', () => onSelectRef.current(h.id))
        .addTo(g)
      markers.current.set(h.id, marker)
    }
    m.fitBounds(area.getBounds(), { padding: [12, 12] })
  }, [ready, center.lat, center.lng, center.label, radiusKm, hospitals])

  // Highlight the selected hospital
  useEffect(() => {
    if (!ready) return
    for (const [id, marker] of markers.current) {
      const on = id === selectedId
      marker.setRadius(on ? 11 : 7)
      marker.getElement()?.classList.toggle('is-selected', on)
      if (on) {
        marker.bringToFront()
        marker.openTooltip()
        map.current?.panTo(marker.getLatLng(), { animate: true })
      }
    }
  }, [ready, selectedId, hospitals])

  return <div ref={el} className="hn-map" role="region" aria-label={`Map of hospitals near ${center.label}`} />
}
