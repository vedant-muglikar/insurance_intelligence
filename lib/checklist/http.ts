import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'
import { ChecklistStorageUnavailableError, SupabaseChecklistRepository, type ChecklistRepository } from './repository'
import { ChecklistInputError } from './service'

export const NO_STORE = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }

export type ChecklistErrorCode = 'unauthenticated' | 'storage_unavailable' | 'invalid' | 'not_found' | 'server_error'

export function checklistError(status: number, code: ChecklistErrorCode, error: string) {
  return NextResponse.json({ success: false, code, error }, { status, headers: NO_STORE })
}

/**
 * Resolves the signed-in user and a repository bound to their session.
 * Checklists hold personal health information, so there is no anonymous mode
 * on the server (the client falls back to device-only storage instead).
 */
export async function getChecklistContext(): Promise<
  { repo: ChecklistRepository; userId: string; db: SupabaseClient } | NextResponse
> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return checklistError(503, 'storage_unavailable', 'Supabase is not configured, so checklists cannot be saved to the database.')
  }
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    if (!data.user) return checklistError(401, 'unauthenticated', 'Sign in to save your checklist.')
    return { repo: new SupabaseChecklistRepository(supabase), userId: data.user.id, db: supabase }
  } catch {
    return checklistError(401, 'unauthenticated', 'Sign in to save your checklist.')
  }
}

export function toErrorResponse(err: unknown, scope: string) {
  if (err instanceof ChecklistInputError) {
    return checklistError(err.status, err.status === 404 ? 'not_found' : 'invalid', err.message)
  }
  if (err instanceof ChecklistStorageUnavailableError) {
    return checklistError(503, 'storage_unavailable', err.message)
  }
  console.error(`[checklist/${scope}]`, (err as Error)?.message)
  return checklistError(500, 'server_error', 'Something went wrong while saving your checklist. Please try again.')
}
