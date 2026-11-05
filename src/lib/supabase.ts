import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/domain'
import { config, supabaseConfigError } from './config'

let client: SupabaseClient<Database> | undefined

export function getSupabaseClient(): SupabaseClient<Database> {
  if (supabaseConfigError) throw new Error(supabaseConfigError)
  if (!client) {
    client = createClient<Database>(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  }
  return client
}
