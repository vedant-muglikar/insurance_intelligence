/**
 * Generates synthetic insurance-policy PDFs for OCR testing:
 *
 *   text_policy.pdf    — 3 pages, real embedded text (existing extraction path)
 *   scanned_policy.pdf — 4 image-only pages: clean, table, skewed+noisy+faded, unreadable low-res
 *   mixed_policy.pdf   — text page, scanned page, text page with a scanned table image
 *
 * Usage:  npx tsx tests/fixtures/generatePolicyPdfs.ts [outDir]
 * The PDFs are also suitable for manual upload testing in the UI.
 */

import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib'
import { createCanvas } from '@napi-rs/canvas'

const A4 = { w: 595.28, h: 841.89 }

// ─── Policy content (synthetic) ─────────────────────────────────────────────

export const SCHEDULE_PAGE = {
  heading: 'POLICY SCHEDULE',
  lines: [
    'Insurer: Suraksha General Insurance Co. Ltd.',
    'Plan Name: Family Health Shield Gold',
    'Policy Number: FHS/2025/0048213',
    'Insured Person: Ravi Kumar Sharma, Age 58',
    'Policy Period: 01/04/2025 to 31/03/2026',
  ],
  table: [
    ['Benefit', 'Limit'],
    ['Sum Insured', 'Rs 5,00,000'],
    ['Annual Premium', 'Rs 18,450'],
    ['Deductible', 'Rs 25,000'],
  ],
}

export const WAITING_PAGE = {
  heading: 'SECTION 4 - WAITING PERIODS',
  lines: [
    '4.1 Initial Waiting Period: 30 days from the first policy start date,',
    'except for claims arising due to an accident.',
    '4.2 Specific Illness Waiting Period: 24 months for cataract, hernia,',
    'joint replacement surgery and kidney stones.',
    '4.3 Pre-Existing Diseases: 36 months of continuous coverage.',
  ],
}

export const SUBLIMIT_TABLE = {
  heading: 'TABLE OF SUB-LIMITS',
  table: [
    ['Treatment', 'Sub-limit'],
    ['Cataract', 'Rs 40,000 per eye'],
    ['Room Rent', '1% of Sum Insured per day'],
    ['Co-payment', '20% for age above 60'],
  ],
}

export const EXCLUSIONS_PAGE = {
  heading: 'SECTION 5 - PERMANENT EXCLUSIONS',
  lines: [
    '5.1 Cosmetic or plastic surgery unless required after an accident.',
    '5.2 Dental treatment unless requiring hospitalisation.',
    '5.3 Infertility and assisted reproduction treatment.',
    '5.4 Intentional self-inflicted injury.',
  ],
}

export const CLAIMS_PAGE = {
  heading: 'SECTION 6 - CLAIM PROCEDURE',
  lines: [
    '6.1 Planned hospitalisation must be notified 48 hours before admission.',
    '6.2 Emergency hospitalisation must be notified within 24 hours.',
    '6.3 Original bills and discharge summary must be submitted within 30 days.',
  ],
}

// ─── Deterministic noise ────────────────────────────────────────────────────

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

// ─── Scanned-page rendering ─────────────────────────────────────────────────

interface ScanOptions {
  dpi?: number
  skewDeg?: number
  noise?: number // speckles per megapixel
  ink?: string
  paper?: string
  fontScale?: number
  seed?: number
}

interface ScanContent {
  heading?: string
  lines?: string[]
  table?: string[][]
}

function renderScan(content: ScanContent, opts: ScanOptions = {}, size = { w: A4.w, h: A4.h }): Buffer {
  const dpi = opts.dpi ?? 200
  const px = (pt: number) => (pt * dpi) / 72
  const width = Math.round(px(size.w))
  const height = Math.round(px(size.h))
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = opts.paper ?? '#ffffff'
  ctx.fillRect(0, 0, width, height)

  ctx.save()
  if (opts.skewDeg) {
    ctx.translate(width / 2, height / 2)
    ctx.rotate((opts.skewDeg * Math.PI) / 180)
    ctx.translate(-width / 2, -height / 2)
  }
  ctx.fillStyle = opts.ink ?? '#111111'
  const fs = opts.fontScale ?? 1
  let y = px(60)

  if (content.heading) {
    ctx.font = `bold ${Math.round(px(15 * fs))}px Arial, Helvetica, sans-serif`
    ctx.fillText(content.heading, px(50), y)
    y += px(30 * fs)
  }
  ctx.font = `${Math.round(px(11 * fs))}px Arial, Helvetica, sans-serif`
  for (const line of content.lines ?? []) {
    ctx.fillText(line, px(50), y)
    y += px(18 * fs)
  }
  if (content.table) {
    y += px(10)
    const colX = [px(50), px(300)]
    for (const [i, row] of content.table.entries()) {
      ctx.font = `${i === 0 ? 'bold ' : ''}${Math.round(px(11 * fs))}px Arial, Helvetica, sans-serif`
      row.forEach((cell, c) => ctx.fillText(cell, colX[c], y))
      ctx.fillRect(px(45), y + px(6), px(480), Math.max(1, px(0.6)))
      y += px(22 * fs)
    }
  }
  ctx.restore()

  if (opts.noise) {
    const rand = rng(opts.seed ?? 7)
    const count = Math.round((opts.noise * width * height) / 1_000_000)
    ctx.fillStyle = '#000000'
    for (let i = 0; i < count; i++) {
      ctx.globalAlpha = 0.2 + rand() * 0.5
      ctx.fillRect(rand() * width, rand() * height, 1 + rand() * 2, 1 + rand() * 2)
    }
    ctx.globalAlpha = 1
  }

  return canvas.toBuffer('image/png')
}

// ─── Text-page drawing ──────────────────────────────────────────────────────

function drawTextPage(page: PDFPage, font: PDFFont, bold: PDFFont, content: ScanContent) {
  let y = A4.h - 60
  if (content.heading) {
    page.drawText(content.heading, { x: 50, y, size: 15, font: bold })
    y -= 30
  }
  for (const line of content.lines ?? []) {
    page.drawText(line, { x: 50, y, size: 11, font })
    y -= 18
  }
  if (content.table) {
    y -= 10
    for (const [i, row] of content.table.entries()) {
      row.forEach((cell, c) => page.drawText(cell, { x: c === 0 ? 50 : 300, y, size: 11, font: i === 0 ? bold : font }))
      y -= 22
    }
  }
  return y
}

async function addScannedPage(doc: PDFDocument, png: Buffer) {
  const image = await doc.embedPng(png)
  const page = doc.addPage([A4.w, A4.h])
  page.drawImage(image, { x: 0, y: 0, width: A4.w, height: A4.h })
}

// ─── Builders ───────────────────────────────────────────────────────────────

export async function buildTextPolicyPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  drawTextPage(doc.addPage([A4.w, A4.h]), font, bold, SCHEDULE_PAGE)
  drawTextPage(doc.addPage([A4.w, A4.h]), font, bold, { ...WAITING_PAGE, table: SUBLIMIT_TABLE.table })
  drawTextPage(doc.addPage([A4.w, A4.h]), font, bold, EXCLUSIONS_PAGE)
  return doc.save()
}

export async function buildScannedPolicyPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  // 1: clean 200 DPI scan of the schedule (with table)
  await addScannedPage(doc, renderScan(SCHEDULE_PAGE, { noise: 40, seed: 1 }))
  // 2: waiting periods + sub-limit table
  await addScannedPage(doc, renderScan({ ...WAITING_PAGE, table: SUBLIMIT_TABLE.table }, { noise: 40, seed: 2 }))
  // 3: skewed, speckled, faded photocopy of the exclusions
  await addScannedPage(
    doc,
    renderScan(EXCLUSIONS_PAGE, { skewDeg: 2.5, noise: 400, ink: '#6a6a6a', paper: '#d4d4d4', seed: 3 }),
  )
  // 4: unreadable — tiny faint text captured at ~40 DPI
  await addScannedPage(
    doc,
    renderScan(CLAIMS_PAGE, { dpi: 40, ink: '#b0b0b0', paper: '#c8c8c8', fontScale: 0.6, noise: 20000, seed: 4 }),
  )
  return doc.save()
}

export async function buildMixedPolicyPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  // 1: digital text page
  drawTextPage(doc.addPage([A4.w, A4.h]), font, bold, SCHEDULE_PAGE)
  // 2: scanned exclusions page
  await addScannedPage(doc, renderScan(EXCLUSIONS_PAGE, { noise: 60, seed: 5 }))
  // 3: digital text page with a scanned sub-limit table pasted in as an image
  const page = doc.addPage([A4.w, A4.h])
  const y = drawTextPage(page, font, bold, WAITING_PAGE)
  const tablePng = renderScan(SUBLIMIT_TABLE, { noise: 30, seed: 6 }, { w: A4.w, h: 300 })
  const tableImage = await doc.embedPng(tablePng)
  page.drawImage(tableImage, { x: 0, y: y - 320, width: A4.w, height: 300 })
  return doc.save()
}

export async function writeFixtures(outDir: string) {
  fs.mkdirSync(outDir, { recursive: true })
  const files = {
    'text_policy.pdf': await buildTextPolicyPdf(),
    'scanned_policy.pdf': await buildScannedPolicyPdf(),
    'mixed_policy.pdf': await buildMixedPolicyPdf(),
  }
  for (const [name, bytes] of Object.entries(files)) fs.writeFileSync(path.join(outDir, name), bytes)
  return Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v]))
}

// CLI entry
if (process.argv[1] && /generatePolicyPdfs\.ts$/.test(process.argv[1])) {
  const out = process.argv[2] ?? path.join(process.cwd(), 'tests', 'fixtures', 'generated')
  writeFixtures(out).then(() => console.log(`Fixtures written to ${out}`))
}
