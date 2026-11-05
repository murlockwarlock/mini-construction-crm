const runtime = typeof window !== 'undefined' ? window.__APP_CONFIG__ : undefined

export const config = {
  supabaseUrl: runtime?.supabaseUrl || import.meta.env.VITE_SUPABASE_URL || '',
  supabasePublishableKey: runtime?.supabasePublishableKey || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
  appEnv: runtime?.appEnv || import.meta.env.VITE_APP_ENV || 'local'
}

export const supabaseConfigError = !config.supabaseUrl || !config.supabasePublishableKey
  ? 'Подключение к серверу не настроено.'
  : null
