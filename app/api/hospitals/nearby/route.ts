import { NextRequest, NextResponse } from 'next/server'
import { geocode, HospitalSearchError, searchNearby } from '@/lib/hospitals/search'

export const runtime = 'nodejs'

const HEADERS = { 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' }

function fail(status: number, error: string) {
  return NextResponse.json({ success: false, error }, { status, headers: HEADERS })
}

/**
 * Hospitals near a point or a place.
 *   GET /api/hospitals/nearby?lat=18.58&lng=73.79&radius=5
 *   GET /api/hospitals/nearby?q=411027&radius=5
 * The location is used for this search only and is not stored.
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const radiusParam = Number(p.get('radius') ?? 5)
  const radius = Number.isFinite(radiusParam) ? Math.min(15, Math.max(1, radiusParam)) : 5
  const q = (p.get('q') ?? '').trim()
  const lat = Number(p.get('lat'))
  const lng = Number(p.get('lng'))

  try {
    if (q) {
      if (q.length > 120) return fail(400, 'That search is too long.')
      const center = await geocode(q)
      return NextResponse.json({ success: true, data: await searchNearby(center.lat, center.lng, radius, center) }, { headers: HEADERS })
    }
    if (p.has('lat') && p.has('lng') && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return NextResponse.json({ success: true, data: await searchNearby(lat, lng, radius) }, { headers: HEADERS })
    }
    return fail(400, 'Send a location (lat and lng) or a place to search (q).')
  } catch (err) {
    if (err instanceof HospitalSearchError) return fail(err.status, err.message)
    console.error('[hospitals/nearby]', (err as Error)?.message)
    return fail(500, 'Could not search for hospitals. Please try again.')
  }
}
