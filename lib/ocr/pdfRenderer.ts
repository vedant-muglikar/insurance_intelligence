/**
 * pdfjs-dist (legacy Node build) + @napi-rs/canvas helpers used by the OCR
 * layer: per-page raster-image analysis and page rendering.
 *
 * Text-layer extraction intentionally stays on the existing pdf-parse path
 * (lib/pdf/extractor.ts); this module only answers "is there an image here?"
 * and "give me pixels for this page".
 */

import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import type { PageImageInfo } from './pageClassifier'
import { PdfInputError } from '@/lib/pdf/validation'
import { textItemsToStructuredText } from '@/lib/pdf/textLayout'

// Resolve from the project root at runtime so bundlers don't rewrite the paths.
const projectRequire = createRequire(path.join(process.cwd(), 'package.json'))

let pdfjsPromise: Promise<any> | null = null

function dirUrl(dir: string): string {
  // pdfjs requires forward slashes and a trailing slash, even on Windows
  return dir.split(path.sep).join('/') + '/'
}

async function loadPdfjs(): Promise<any> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const entry = projectRequire.resolve('pdfjs-dist/legacy/build/pdf.mjs')
      const pdfjs = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ pathToFileURL(entry).href)
      pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
        projectRequire.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'),
      ).href
      return pdfjs
    })().catch((err) => {
      pdfjsPromise = null
      throw err
    })
  }
  return pdfjsPromise
}

export class PdfPasswordError extends PdfInputError {
  constructor() {
    super('This PDF is password-protected. Please remove the password and upload it again.')
    this.name = 'PdfPasswordError'
  }
}

export interface OpenedPdf {
  numPages: number
  getPage(pageNumber: number): Promise<any>
  destroy(): Promise<void>
}

export async function openPdf(data: Uint8Array): Promise<OpenedPdf> {
  const pdfjs = await loadPdfjs()
  const pkgDir = path.dirname(projectRequire.resolve('pdfjs-dist/package.json'))

  const task = pdfjs.getDocument({
    // pdfjs transfers (detaches) the buffer it is given — always pass a copy
    data: new Uint8Array(data),
    standardFontDataUrl: dirUrl(path.join(pkgDir, 'standard_fonts')),
    cMapUrl: dirUrl(path.join(pkgDir, 'cmaps')),
    cMapPacked: true,
    // Hardening for untrusted uploads: never evaluate PDF-embedded code
    isEvalSupported: false,
    enableXfa: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  })

  try {
    const doc = await task.promise
    return {
      numPages: doc.numPages,
      getPage: (n: number) => doc.getPage(n),
      destroy: () => doc.destroy(),
    }
  } catch (err: any) {
    if (err?.name === 'PasswordException') throw new PdfPasswordError()
    throw err
  }
}

// ─── Raster image analysis ──────────────────────────────────────────────────

type Matrix = [number, number, number, number, number, number]

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ]
}

/**
 * Walks the page operator list tracking the current transformation matrix and
 * sums the area of every painted raster image (the unit square under the CTM).
 */
export async function analyzePageImages(page: any): Promise<PageImageInfo> {
  const pdfjs = await loadPdfjs()
  const OPS = pdfjs.OPS
  const view = page.view as number[]
  const pageArea = Math.max(1, Math.abs((view[2] - view[0]) * (view[3] - view[1])))

  const ops = await page.getOperatorList()
  let ctm: Matrix = [1, 0, 0, 1, 0, 0]
  const stack: Matrix[] = []
  let imageArea = 0
  let imageCount = 0
  let minImageDpi: number | null = null

  const paintImage = (pixelWidth?: number) => {
    const w = Math.hypot(ctm[0], ctm[1])
    const h = Math.hypot(ctm[2], ctm[3])
    const area = w * h
    if (area <= 0) return
    imageArea += area
    imageCount++
    // Only judge resolution of images that matter (≥10% of the page)
    if (pixelWidth && w > 0 && area / pageArea >= 0.1) {
      const dpi = (pixelWidth / w) * 72
      minImageDpi = minImageDpi === null ? dpi : Math.min(minImageDpi, dpi)
    }
  }

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i]
    const args = ops.argsArray[i]
    switch (fn) {
      case OPS.save:
        stack.push(ctm)
        break
      case OPS.restore:
        ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0]
        break
      case OPS.transform:
        ctm = multiply(ctm, args as Matrix)
        break
      case OPS.paintFormXObjectBegin:
        stack.push(ctm)
        if (Array.isArray(args?.[0]) && args[0].length === 6) ctm = multiply(ctm, args[0] as Matrix)
        break
      case OPS.paintFormXObjectEnd:
        ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0]
        break
      case OPS.paintImageXObject:
      case OPS.paintInlineImageXObject:
      case OPS.paintImageMaskXObject:
        paintImage(typeof args?.[1] === 'number' ? args[1] : args?.[0]?.width)
        break
      case OPS.paintImageXObjectRepeat:
        paintImage(typeof args?.[1] === 'number' ? args[1] : undefined)
        break
    }
  }

  return {
    imageCoverage: Math.min(1, imageArea / pageArea),
    imageCount,
    minImageDpi: minImageDpi === null ? null : Math.round(minImageDpi),
  }
}

// ─── Fallback text layer ─────────────────────────────────────────────────────

/**
 * Text-layer extraction with the modern pdfjs-dist, used only when the
 * primary pdf-parse extractor fails on a document.
 */
export async function extractPageTextLayer(page: any): Promise<string> {
  const content = await page.getTextContent()
  return textItemsToStructuredText(content.items)
}

// ─── Rendering ───────────────────────────────────────────────────────────────

/** Cap render size to keep memory bounded on oversized pages (~25 MP) */
const MAX_RENDER_PIXELS = 25_000_000

export interface RenderedPage {
  png: Buffer
  width: number
  height: number
  dpi: number
}

export async function renderPageToPng(page: any, dpi: number): Promise<RenderedPage> {
  const base = page.getViewport({ scale: 1 })
  let scale = dpi / 72
  const pixels = base.width * scale * base.height * scale
  if (pixels > MAX_RENDER_PIXELS) scale *= Math.sqrt(MAX_RENDER_PIXELS / pixels)

  const viewport = page.getViewport({ scale })
  const width = Math.ceil(viewport.width)
  const height = Math.ceil(viewport.height)

  const { createCanvas } = projectRequire('@napi-rs/canvas')
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  try {
    await page.render({ canvasContext: ctx, canvas, viewport, background: '#ffffff' }).promise
    const png: Buffer = await canvas.encode('png')
    return { png, width, height, dpi: Math.round(scale * 72) }
  } finally {
    // Release the backing store promptly; large pages are tens of MB
    canvas.width = 0
    canvas.height = 0
    page.cleanup()
  }
}
