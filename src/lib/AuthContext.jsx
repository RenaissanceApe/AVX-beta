import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { logger } from './logger'
import { setMonitoringUser } from './monitoring'
import { setOfflineUser, clearOfflineData } from './offline'
import { useI18n } from '../i18n'

const AuthContext = createContext({})

export const MIN_PASSWORD_LENGTH = 8

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  // True after the user arrives from a password-reset email
  const [passwordRecovery, setPasswordRecovery] = useState(false)
  // True when this person uses an authenticator app and this session hasn't given the code yet
  const [mfaRequired, setMfaRequired] = useState(false)
  const { lang, setLang } = useI18n()

  // A language saved on the profile (Account → Language) wins over the browser default
  useEffect(() => {
    if (profile?.language && profile.language !== lang) setLang(profile.language)
  }, [profile?.language]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION on load, so no separate getSession() call.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
      const nextUser = session?.user ?? null
      setUser(nextUser)
      setMonitoringUser(nextUser?.id ?? null)
      setOfflineUser(nextUser?.id ?? null)
      // Signed out (by the user or because the session ended): remove offline copies from this device
      if (event === 'SIGNED_OUT') clearOfflineData()
      if (!nextUser) {
        setProfile(null)
        setMfaRequired(false)
        setLoading(false)
        return
      }
      if (event === 'TOKEN_REFRESHED') return
      // Supabase calls made directly inside this callback can deadlock; defer them.
      setTimeout(() => afterSignIn(nextUser.id), 0)
    })
    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Read from the session itself (no network), so it also works offline
  async function afterSignIn(userId) {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (error) logger.warn('auth', 'Could not read sign-in level', { message: error.message })
    const needsCode = data?.nextLevel === 'aal2' && data?.currentLevel !== 'aal2'
    setMfaRequired(needsCode)
    if (needsCode) {
      setProfile(null)
      setLoading(false)
      return
    }
    fetchProfile(userId)
  }

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
    await clearOfflineData()
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
      user, profile, loading, signUp, signIn, signOut, updateProfile, mfaRequired,
      passwordRecovery, clearPasswordRecovery: () => setPasswordRecovery(false),
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
