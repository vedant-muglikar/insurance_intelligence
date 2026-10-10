import { NextRequest, NextResponse } from 'next/server'

// Proxies Google Translate's public endpoint. The website widget's own backend
// (translate-pa.googleapis.com) is blocked on some networks; this host is not.
const ENDPOINT = 'https://translate.googleapis.com/translate_a/t'
const TARGETS = new Set(['hi'])
const MAX_TEXTS = 200
const MAX_CHARS = 5000
// Keep each upstream request comfortably under Google's body size limit.
const CHUNK_CHARS = 4000

async function translateChunk(texts: string[], target: string): Promise<string[]> {
  const body = new URLSearchParams()
  for (const t of texts) body.append('q', t)

  const res = await fetch(`${ENDPOINT}?client=gtx&sl=en&tl=${target}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) throw new Error(`Translate upstream returned ${res.status}`)

  // One input comes back as a bare string or [text, lang]; several come back as an array of those.
  const data: unknown = await res.json()
  const items = texts.length === 1 && !Array.isArray(data) ? [data] : (data as unknown[])
  return texts.map((original, i) => {
    const item = items[i]
    if (typeof item === 'string') return item
    if (Array.isArray(item) && typeof item[0] === 'string') return item[0]
    return original
  })
}

export async function POST(request: NextRequest) {
  let texts: unknown
  let target: unknown
  try {
    ;({ texts, target } = await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof target !== 'string' || !TARGETS.has(target)) {
    return NextResponse.json({ error: 'Unsupported target language' }, { status: 400 })
  }
  if (
    !Array.isArray(texts) ||
    texts.length === 0 ||
    texts.length > MAX_TEXTS ||
    texts.some((t) => typeof t !== 'string' || t.length > MAX_CHARS)
  ) {
    return NextResponse.json({ error: `Send 1-${MAX_TEXTS} strings of up to ${MAX_CHARS} characters` }, { status: 400 })
  }

  const chunks: string[][] = []
  let current: string[] = []
  let size = 0
  for (const t of texts as string[]) {
    if (current.length && size + t.length > CHUNK_CHARS) {
      chunks.push(current)
      current = []
      size = 0
    }
    current.push(t)
    size += t.length
  }
  if (current.length) chunks.push(current)

  try {
    const results = await Promise.all(chunks.map((c) => translateChunk(c, target as string)))
    return NextResponse.json({ translations: results.flat() })
  } catch (err) {
    console.error('[translate]', err)
    return NextResponse.json({ error: 'Translation service unavailable' }, { status: 502 })
  }
}
