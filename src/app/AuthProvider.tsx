/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSupabaseClient } from '../lib/supabase'
import { getProfile } from '../lib/api'
import type { Profile } from '../types/domain'

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  loading: boolean
  configurationError: string | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [configurationError, setConfigurationError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    let client
    try { client = getSupabaseClient() } catch (error) {
      setConfigurationError(error instanceof Error ? error.message : 'Подключение к серверу не настроено.')
      setLoading(false)
      return () => { active = false }
    }
    void client.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      if (!nextSession) {
        setProfile(null)
        setLoading(false)
      }
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    let active = true
    if (!session) return
    setLoading(true)
    void getProfile(session.user.id).then((nextProfile) => {
      if (!active) return
      setProfile(nextProfile)
      setLoading(false)
    }).catch(() => {
      if (!active) return
      setProfile(null)
      setLoading(false)
    })
    return () => { active = false }
  }, [session])

  const value = useMemo<AuthContextValue>(() => ({
    session,
    profile,
    loading,
    configurationError,
    async signIn(email, password) {
      const { error } = await getSupabaseClient().auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw error
    },
    async signOut() {
      const { error } = await getSupabaseClient().auth.signOut()
      if (error) throw error
    }
  }), [configurationError, loading, profile, session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('AuthProvider is missing')
  return value
}
