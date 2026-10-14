import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { logger } from './logger'

const AuthContext = createContext({})

export const MIN_PASSWORD_LENGTH = 8

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  // True after the user arrives from a password-reset email
  const [passwordRecovery, setPasswordRecovery] = useState(false)

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION on load, so no separate getSession() call.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
      const nextUser = session?.user ?? null
      setUser(nextUser)
      if (!nextUser) {
        setProfile(null)
        setLoading(false)
        return
      }
      if (event === 'TOKEN_REFRESHED') return
      // Supabase calls made directly inside this callback can deadlock; defer them.
      setTimeout(() => fetchProfile(nextUser.id), 0)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    if (error) logger.error('auth', error, { step: 'fetchProfile' })
    setProfile(data)
    setLoading(false)
  }

  async function signUp(email, password, fullName) {
    return supabase.auth.signUp({
      email, password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth`,
      }
    })
  }

  async function signIn(email, password) {
    return supabase.auth.signInWithPassword({ email, password })
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) logger.error('auth', error, { step: 'signOut' })
  }

  async function updateProfile(changes) {
    const { data, error } = await supabase.from('profiles').update(changes).eq('id', user.id).select().single()
    if (!error) setProfile(data)
    return { data, error }
  }

  return (
    <AuthContext.Provider value={{
      user, profile, loading, signUp, signIn, signOut, updateProfile,
      passwordRecovery, clearPasswordRecovery: () => setPasswordRecovery(false),
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
