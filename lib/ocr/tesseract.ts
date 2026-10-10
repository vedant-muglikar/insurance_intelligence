/**
 * Server-side Tesseract.js worker pool.
 *
 * - Language data is loaded from the bundled @tesseract.js-data/eng package,
 *   so no document content or model download ever leaves the server at runtime.
 * - Workers are created lazily, shared across requests, and terminated after
 *   a period of inactivity to release memory.
 * - A timed-out job tears the pool down (Tesseract jobs cannot be cancelled
 *   individually); the next request starts a fresh pool.
 */

import path from 'node:path'
import { createRequire } from 'node:module'

const projectRequire = createRequire(path.join(process.cwd(), 'package.json'))

export const OCR_ENGINE_NAME = 'tesseract.js (LSTM, eng)'
const IDLE_TERMINATE_MS = 60_000

export class OcrTimeoutError extends Error {
  constructor(ms: number) {
    super(`OCR timed out after ${Math.round(ms / 1000)}s`)
    this.name = 'OcrTimeoutError'
  }
}

interface Pool {
  scheduler: any
  size: number
  ready: Promise<void>
}

let pool: Pool | null = null
let idleTimer: ReturnType<typeof setTimeout> | null = null
let activeJobs = 0

function langPath(): string {
  // 4.0.0_best_int = the LSTM model Tesseract.js uses by default (best accuracy/size trade-off)
  return path.join(path.dirname(projectRequire.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int')
}

function getPool(size: number, dpi: number): Pool {
  if (pool && pool.size === size) return pool
  if (pool) void terminatePool()

  const Tesseract = projectRequire('tesseract.js')
  const scheduler = Tesseract.createScheduler()
  const ready = (async () => {
    const workers = await Promise.all(
      Array.from({ length: size }, () =>
        Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY, {
          langPath: langPath(),
          gzip: true,
          // Do not write traineddata caches into the working directory
          cacheMethod: 'none',
        }),
      ),
    )
    for (const worker of workers) {
      await worker.setParameters({
        tessedit_pageseg_mode: Tesseract.PSM.AUTO,
        preserve_interword_spaces: '1',
        user_defined_dpi: String(dpi),
      })
      scheduler.addWorker(worker)
    }
  })()

  const created: Pool = { scheduler, size, ready }
  ready.catch(() => {
    if (pool === created) pool = null
  })
  pool = created
  return created
}

export async function terminatePool(): Promise<void> {
  const current = pool
  pool = null
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
  if (current) {
    try {
      await current.scheduler.terminate()
    } catch {
      /* already gone */
    }
  }
}

function scheduleIdleShutdown() {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    if (activeJobs === 0) void terminatePool()
  }, IDLE_TERMINATE_MS)
  // Never keep the process alive just for this timer
  ;(idleTimer as any).unref?.()
}

export interface TesseractPageResult {
  blocks: any[]
  text: string
  confidence: number
}

export async function recognizePage(
  image: Buffer,
  options: { concurrency: number; dpi: number; timeoutMs: number },
): Promise<TesseractPageResult> {
  const current = getPool(options.concurrency, options.dpi)
  activeJobs++
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const job = (async () => {
      await current.ready
      const result = await current.scheduler.addJob('recognize', image, {}, { blocks: true, text: true })
      return {
        blocks: result.data.blocks ?? [],
        text: result.data.text ?? '',
        confidence: result.data.confidence ?? 0,
      }
    })()
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new OcrTimeoutError(options.timeoutMs)), options.timeoutMs)
    })
    return await Promise.race([job, timeout])
  } catch (err) {
    if (err instanceof OcrTimeoutError && pool === current) await terminatePool()
    throw err
  } finally {
    if (timer) clearTimeout(timer)
    activeJobs--
    if (activeJobs === 0) scheduleIdleShutdown()
  }
}
