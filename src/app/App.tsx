import { lazy, Suspense } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider'
import { Shell } from './Shell'
import { CACHE_BUSTER, persister, queryClient } from './queryClient'

// Auth forms (zod + react-hook-form) load only when needed.
const AuthRoutes = lazy(() => import('@/features/auth/AuthScreens').then((m) => ({ default: m.AuthRoutes })))
const ResetPassword = lazy(() => import('@/features/auth/AuthScreens').then((m) => ({ default: m.ResetPassword })))
const VerifyEmail = lazy(() => import('@/features/auth/AuthScreens').then((m) => ({ default: m.VerifyEmail })))
const Splash = () => <div className="h-full bg-bg" aria-busy="true" />

function Gate() {
  const { status } = useAuth()
  switch (status) {
    case 'loading': return <Splash />
    case 'signedOut': return <Suspense fallback={<Splash />}><AuthRoutes /></Suspense>
    case 'unverified': return <Suspense fallback={<Splash />}><VerifyEmail /></Suspense>
    case 'recovery': return <Suspense fallback={<Splash />}><ResetPassword /></Suspense>
    case 'ready': return <Shell />
  }
}

export default function App() {
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, buster: CACHE_BUSTER }}>
      <AuthProvider>
        <BrowserRouter>
          <Gate />
        </BrowserRouter>
      </AuthProvider>
    </PersistQueryClientProvider>
  )
}
