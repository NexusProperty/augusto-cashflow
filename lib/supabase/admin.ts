import { createClient } from '@supabase/supabase-js'

let _admin: ReturnType<typeof createClient> | null = null

export function createAdminClient() {
  if (_admin) return _admin
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase admin env vars')
  _admin = createClient(url, key)
  return _admin
}
