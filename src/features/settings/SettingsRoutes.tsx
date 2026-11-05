import { lazy, Suspense } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { PageHeader } from '@/ui/PageHeader'

const AccountsScreen = lazy(() => import('./AccountsScreen'))
const CategoriesScreen = lazy(() => import('./CategoriesScreen'))

function SettingsHome() {
  const item = 'flex min-h-14 items-center justify-between rounded-2xl bg-surface px-4'
  return (
    <div>
      <PageHeader title="Settings" back="/" backLabel="Home" />
      <nav className="space-y-3 px-4 pb-8" aria-label="Settings">
        <Link to="/settings/accounts" className={item}>Accounts <span aria-hidden className="text-muted">›</span></Link>
        <Link to="/settings/categories" className={item}>Categories <span aria-hidden className="text-muted">›</span></Link>
      </nav>
    </div>
  )
}

/** Full-screen overlay area; the tab shell stays mounted underneath. */
export default function SettingsRoutes() {
  return (
    <div className="pb-safe pt-safe fixed inset-0 z-30 overflow-y-auto overscroll-contain bg-bg">
      <Suspense fallback={<div className="p-4" aria-busy="true" />}>
        <Routes>
          <Route path="/settings" element={<SettingsHome />} />
          <Route path="/settings/accounts" element={<AccountsScreen />} />
          <Route path="/settings/categories" element={<CategoriesScreen />} />
          <Route path="*" element={<Navigate to="/settings" replace />} />
        </Routes>
      </Suspense>
    </div>
  )
}
