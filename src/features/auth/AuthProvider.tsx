import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { clearCache } from '@/app/queryClient'

export type AuthStatus = 'loading' | 'signedOut' | 'unverified' | 'recovery' | 'ready'

interface AuthCtx {
  status: AuthStatus
  session: Session | null
  signOut: () => Promise<void>
  finishRecovery: () => void
}

const Ctx = createContext<AuthCtx | null>(null)

export function deriveStatus(session: Session | null, loaded: boolean, recovery: boolean): AuthStatus {
  if (!loaded) return 'loading'
  if (!session) return 'signedOut'
  if (recovery) return 'recovery'
  return session.user.email_confirmed_at ? 'ready' : 'unverified'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoaded(true)
    })
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_OUT') {
        setRecovery(false)
        void clearCache()
      }
      setSession(s)
      setLoaded(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const value = useMemo<AuthCtx>(
    () => ({
      status: deriveStatus(session, loaded, recovery),
      session,
      signOut: async () => {
        await supabase.auth.signOut()
      },
      finishRecovery: () => setRecovery(false),
    }),
    [session, loaded, recovery],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth outside AuthProvider')
  return c
}
