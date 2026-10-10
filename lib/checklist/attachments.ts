/**
 * Supporting-document validation. Mirrors the policy upload checks in
 * lib/pdf/validation.ts: the file type is detected from its bytes, never
 * trusted from the extension or the browser-supplied MIME type.
 */

import { hasPdfHeader } from '@/lib/pdf/validation'

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const ATTACHMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp'

export type AttachmentMime = 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp'

export function detectAttachmentType(bytes: Uint8Array): AttachmentMime | null {
  if (hasPdfHeader(bytes)) return 'application/pdf'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to))
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  return null
}

/** Keeps a readable base name; removes path parts and characters unsafe in storage keys */
export function safeFileName(name: string): string {
  const base = (name || 'document').split(/[\\/]/).pop() || 'document'
  const cleaned = base.replace(/[^\w.\- ()]+/g, '_').replace(/\s+/g, ' ').trim()
  return (cleaned || 'document').slice(-100)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
