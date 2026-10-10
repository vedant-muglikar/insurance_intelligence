/**
 * Image preprocessing for OCR (server-side, sharp):
 *   1. flatten transparency onto white, convert to greyscale
 *   2. upscale small renders so body text has enough pixels per glyph
 *   3. estimate skew with a projection-profile search and rotate it out
 *   4. stretch contrast (paper → white, ink → black; restores faded photocopies) and mildly sharpen
 *
 * Binarisation is left to Tesseract (Otsu), which handles uneven backgrounds
 * better than a single global threshold applied here.
 */

import sharp from 'sharp'

export interface PreprocessResult {
  image: Buffer
  width: number
  height: number
  /** Degrees rotated to correct skew (0 when none applied) */
  deskewAngle: number
  /** Share of dark pixels — near zero means a blank page */
  inkRatio: number
  /** Paper-to-ink luminance spread before enhancement (0–255) */
  contrastRange: number
  contrastEnhanced: boolean
  upscaled: boolean
}

const ANALYSIS_WIDTH = 1000
const MIN_OCR_WIDTH = 2000
const MAX_SKEW_DEG = 6
const MIN_SKEW_TO_CORRECT = 0.3

function otsuThreshold(histogram: number[], total: number): number {
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * histogram[i]
  let sumB = 0
  let wB = 0
  let best = 0
  let threshold = 128
  for (let t = 0; t < 256; t++) {
    wB += histogram[t]
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += t * histogram[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) ** 2
    if (between > best) {
      best = between
      threshold = t
    }
  }
  return threshold
}

function percentile(histogram: number[], total: number, p: number): number {
  const target = total * p
  let acc = 0
  for (let i = 0; i < 256; i++) {
    acc += histogram[i]
    if (acc >= target) return i
  }
  return 255
}

/**
 * Projection-profile skew estimate on a binarised, downsampled image.
 * For each candidate angle, dark pixels are sheared onto rows; the angle that
 * aligns text lines produces the "spikiest" row histogram (max sum of squares).
 * Returns the skew in degrees (positive = text lines slope downward to the right).
 */
export function estimateSkewAngle(
  gray: Uint8Array,
  width: number,
  height: number,
  threshold: number,
): number {
  const xs: number[] = []
  const ys: number[] = []
  const stride = Math.max(1, Math.floor((width * height) / 400_000))
  for (let i = 0; i < gray.length; i += stride) {
    if (gray[i] < threshold) {
      xs.push(i % width)
      ys.push(Math.floor(i / width))
    }
  }
  if (xs.length < 200) return 0

  const rows = new Float64Array(height + 2 * Math.ceil(width * Math.tan((MAX_SKEW_DEG * Math.PI) / 180)) + 2)
  const offset = Math.ceil(width * Math.tan((MAX_SKEW_DEG * Math.PI) / 180)) + 1

  const score = (deg: number): number => {
    rows.fill(0)
    const t = Math.tan((deg * Math.PI) / 180)
    for (let k = 0; k < xs.length; k++) {
      const r = Math.round(ys[k] - xs[k] * t) + offset
      if (r >= 0 && r < rows.length) rows[r]++
    }
    let s = 0
    for (let r = 0; r < rows.length; r++) s += rows[r] * rows[r]
    return s
  }

  let bestAngle = 0
  let bestScore = score(0)
  for (let a = -MAX_SKEW_DEG; a <= MAX_SKEW_DEG; a += 0.5) {
    const s = score(a)
    if (s > bestScore) {
      bestScore = s
      bestAngle = a
    }
  }
  const coarse = bestAngle
  for (let a = coarse - 0.5; a <= coarse + 0.5; a += 0.1) {
    const s = score(a)
    if (s > bestScore) {
      bestScore = s
      bestAngle = a
    }
  }
  return Math.round(bestAngle * 10) / 10
}

export async function preprocessForOcr(input: Buffer): Promise<PreprocessResult> {
  const base = sharp(input, { limitInputPixels: 60_000_000 }).flatten({ background: '#ffffff' }).grayscale()
  const meta = await sharp(input).metadata()
  const srcWidth = meta.width ?? 0

  // ── Analysis on a small copy ────────────────────────────────────────────
  const { data, info } = await base
    .clone()
    .resize({ width: Math.min(ANALYSIS_WIDTH, srcWidth || ANALYSIS_WIDTH) })
    .raw()
    .toBuffer({ resolveWithObject: true })

  const gray = new Uint8Array(data.buffer, data.byteOffset, data.length)
  const histogram = new Array<number>(256).fill(0)
  for (let i = 0; i < gray.length; i++) histogram[gray[i]]++
  const total = gray.length
  const threshold = otsuThreshold(histogram, total)

  // Paper level = median (background dominates any page); ink level = mean of
  // pixels darker than the Otsu threshold. Robust on near-uniform pages where
  // percentile-based stretching collapses.
  const paper = percentile(histogram, total, 0.5)
  let inkSum = 0
  let dark = 0
  for (let v = 0; v < Math.min(threshold, paper); v++) {
    inkSum += v * histogram[v]
    dark += histogram[v]
  }
  const ink = dark > 0 ? inkSum / dark : 0
  const contrastRange = Math.max(0, paper - ink)
  const inkRatio = dark / total

  const skew = inkRatio > 0.002 ? estimateSkewAngle(gray, info.width, info.height, threshold) : 0

  // ── Pass 1: levels stretch (faded ink → black, grey paper → white) ──────
  // Done as its own pass because sharp applies operations in a fixed internal
  // order; this guarantees rotation fills with true paper-white afterwards.
  let source = base.clone()
  let contrastEnhanced = false
  if (contrastRange >= 30) {
    const gain = 255 / contrastRange
    contrastEnhanced = gain > 1.15
    source = source.linear(gain, -ink * gain)
  }
  const leveled = await source.raw().toBuffer({ resolveWithObject: true })

  // ── Pass 2: resolution, deskew, sharpening ──────────────────────────────
  let pipeline = sharp(leveled.data, {
    raw: { width: leveled.info.width, height: leveled.info.height, channels: leveled.info.channels },
  })
  let upscaled = false
  if (srcWidth > 0 && srcWidth < MIN_OCR_WIDTH) {
    pipeline = pipeline.resize({ width: MIN_OCR_WIDTH, kernel: 'lanczos3' })
    upscaled = true
  }

  const deskewAngle = Math.abs(skew) >= MIN_SKEW_TO_CORRECT ? -skew : 0
  if (deskewAngle !== 0) {
    pipeline = pipeline.rotate(deskewAngle, { background: '#ffffff' })
  }
  pipeline = pipeline.sharpen({ sigma: 0.8 })

  const { data: out, info: outInfo } = await pipeline.png({ compressionLevel: 3 }).toBuffer({ resolveWithObject: true })

  return {
    image: out,
    width: outInfo.width,
    height: outInfo.height,
    deskewAngle,
    inkRatio,
    contrastRange,
    contrastEnhanced,
    upscaled,
  }
}
