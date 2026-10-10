import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null = null

/**
 * Service-role client for server routes only. It bypasses row-level security, which is what lets the app write
 * shared plan templates that no browser user is allowed to write. Never import this from client code.
 * Returns null when the key is not configured, and the app then simply skips saving and reusing analyses.
 */
export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  if (!cached) cached = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return cached
}
