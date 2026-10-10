'use client'

/**
 * Translates the rendered page in place by rewriting text-node values through /api/translate.
 * Only nodeValue is changed, never the node structure, so React keeps working on the same nodes;
 * when it re-renders a node back to English the observer translates the new text again.
 */

export type PageLang = 'en' | 'hi'

const STORAGE_KEY = 'pl-lang'
const BATCH = 100
const MAX_CHARS = 5000
const SKIP = 'script,style,noscript,textarea,code,pre,[contenteditable="true"],.notranslate,[translate="no"]'

type Entry = { original: string; translated: string }

const cache = new Map<string, string>()
const tracked = new Map<Text, Entry>()
const pending = new Set<Text>()
const listeners = new Set<(lang: PageLang) => void>()

let lang: PageLang = 'en'
let observer: MutationObserver | null = null
let timer: number | null = null

export function getSavedLang(): PageLang {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'hi' ? 'hi' : 'en'
  } catch {
    return 'en'
  }
}

export function getPageLang(): PageLang {
  return lang
}

export function subscribe(fn: (lang: PageLang) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function queue(node: Text) {
  const entry = tracked.get(node)
  // Our own write coming back through the observer.
  if (entry && node.nodeValue === entry.translated) return
  const value = node.nodeValue
  if (!value || value.length > MAX_CHARS || !/[A-Za-z]/.test(value)) return
  if (!node.parentElement || node.parentElement.closest(SKIP)) return
  pending.add(node)
}

function collect(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return queue(root as Text)
  if (root.nodeType !== Node.ELEMENT_NODE) return
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) queue(walker.currentNode as Text)
}

async function fetchMissing(texts: string[]) {
  const missing = [...new Set(texts)].filter((t) => !cache.has(t))
  const batches: string[][] = []
  for (let i = 0; i < missing.length; i += BATCH) batches.push(missing.slice(i, i + BATCH))

  await Promise.all(
    batches.map(async (batch) => {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: batch, target: 'hi' }),
      })
      if (!res.ok) throw new Error(`Translation failed (${res.status})`)
      const { translations } = (await res.json()) as { translations: string[] }
      batch.forEach((t, j) => cache.set(t, translations[j] ?? t))
    })
  )
}

async function flush() {
  if (timer !== null) {
    window.clearTimeout(timer)
    timer = null
  }
  const work = [...pending]
    .filter((node) => node.isConnected)
    .map((node) => {
      const original = node.nodeValue ?? ''
      const [, lead, core, trail] = original.match(/^(\s*)([\s\S]*?)(\s*)$/)!
      return { node, original, lead, core, trail }
    })
  pending.clear()
  if (!work.length) return

  await fetchMissing(work.map((w) => w.core))
  if (lang !== 'hi') return

  for (const { node, original, lead, core, trail } of work) {
    // Changed while the request was in flight; the observer has queued the newer text.
    if (node.nodeValue !== original) continue
    const translated = lead + (cache.get(core) ?? core) + trail
    tracked.set(node, { original, translated })
    node.nodeValue = translated
  }
  for (const node of tracked.keys()) if (!node.isConnected) tracked.delete(node)
}

function scheduleFlush() {
  if (timer !== null) return
  timer = window.setTimeout(() => {
    timer = null
    flush().catch((err) => console.error('[translate]', err))
  }, 60)
}

function setLang(next: PageLang) {
  lang = next
  document.documentElement.lang = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {}
  listeners.forEach((fn) => fn(next))
}

function restore() {
  observer?.disconnect()
  observer = null
  pending.clear()
  for (const [node, { original, translated }] of tracked) {
    if (node.nodeValue === translated) node.nodeValue = original
  }
  tracked.clear()
}

/** Switches the whole page between English and Hindi. Resolves once the visible text is translated. */
export async function setPageLanguage(next: PageLang): Promise<void> {
  if (next === lang) return
  if (next === 'en') {
    setLang('en')
    restore()
    return
  }

  setLang('hi')
  observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') queue(r.target as Text)
      else r.addedNodes.forEach(collect)
    }
    if (pending.size) scheduleFlush()
  })
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })

  collect(document.body)
  try {
    await flush()
  } catch (err) {
    setLang('en')
    restore()
    throw err
  }
}
