/** Text embeddings behind a small interface, so the matcher does not care where vectors come from. */

export interface Embedder {
  /** Identifies model and settings. Vectors from different embedders must never be mixed. */
  name: string
  embed(texts: string[]): Promise<number[][]>
}

export function normalize(v: number[]): number[] {
  let n = 0
  for (const x of v) n += x * x
  n = Math.sqrt(n) || 1
  return v.map((x) => x / n)
}

/** Cosine similarity. Vectors from this module are unit length, so this is a dot product. */
export function cosine(a: number[], b: number[]): number {
  let d = 0
  for (let i = 0; i < a.length; i++) d += a[i] * b[i]
  return d
}

export const GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001'
export const EMBEDDING_DIMENSIONS = 768

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Gemini embeddings over the REST API. The key stays on the server: never call this from browser code. */
export function geminiEmbedder(apiKey: string, opts: { model?: string; dimensions?: number } = {}): Embedder {
  const model = opts.model ?? GEMINI_EMBEDDING_MODEL
  const dimensions = opts.dimensions ?? EMBEDDING_DIMENSIONS
  return {
    name: `${model}@${dimensions}`,
    async embed(texts) {
      const out: number[][] = []
      // The free tier counts every text as a request and allows 100 a minute. Stay under it and honour retry hints.
      const sent: number[] = []
      for (let i = 0; i < texts.length; i += 40) {
        const batch = texts.slice(i, i + 40)
        const now = Date.now()
        while (sent.length && now - sent[0] > 60_000) sent.shift()
        if (sent.length + batch.length > 90) await sleep(Math.max(0, 61_000 - (now - sent[0])))
        for (let k = 0; k < batch.length; k++) sent.push(Date.now())
        const body = {
          requests: batch.map((text) => ({
            model: `models/${model}`,
            content: { parts: [{ text }] },
            taskType: 'SEMANTIC_SIMILARITY',
            outputDimensionality: dimensions,
          })),
        }
        let lastError = ''
        for (let attempt = 0; attempt < 6; attempt++) {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify(body),
          })
          if (res.ok) {
            const json = (await res.json()) as { embeddings?: Array<{ values: number[] }> }
            if (!json.embeddings || json.embeddings.length !== batch.length) throw new Error('Embedding response did not match the request.')
            out.push(...json.embeddings.map((e) => normalize(e.values)))
            lastError = ''
            break
          }
          const text = await res.text()
          lastError = `${res.status} ${text.slice(0, 160)}`
          if (res.status !== 429 && res.status < 500) break
          const hint = /retry in ([\d.]+)s/i.exec(text)
          await sleep(hint ? Math.ceil(parseFloat(hint[1]) * 1000) + 1500 : 1500 * (attempt + 1))
        }
        if (lastError) throw new Error(`Embedding request failed: ${lastError}`)
      }
      return out
    },
  }
}
