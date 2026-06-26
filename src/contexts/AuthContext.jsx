import { createContext, useContext, useState, useEffect, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'

const AuthContext = createContext(null)

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  const supabase = useMemo(() => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  }, [])

  useEffect(() => {
    if (!supabase) { setLoading(false); return }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [supabase])

  const signIn = async (email) => {
    if (!supabase) throw new Error('Supabase not configured')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + '/chat' },
    })
    if (error) throw error
  }

  const verifyOtp = async (email, token) => {
    if (!supabase) throw new Error('Supabase not configured')
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
    if (error) throw error
  }

  const signOut = async () => {
    if (!supabase) return
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, supabase, signIn, verifyOtp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
