import { lazy, Suspense } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { useTheme, type ThemePref } from '@/lib/theme'
import { PageHeader } from '@/ui/PageHeader'

const AccountsScreen = lazy(() => import('./AccountsScreen'))
const CategoriesScreen = lazy(() => import('./CategoriesScreen'))
const RemindersScreen = lazy(() => import('./RemindersScreen'))

function SettingsHome() {
  const { signOut } = useAuth()
  const { pref, setPref } = useTheme()
  const item = 'flex min-h-14 items-center justify-between rounded-2xl bg-surface px-4'
  return (
    <div>
      <PageHeader title="Settings" back="/" backLabel="Home" />
      <nav className="space-y-3 px-4 pb-8" aria-label="Settings">
        <Link to="/settings/accounts" className={item}>Accounts <span aria-hidden className="text-muted">›</span></Link>
        <Link to="/settings/categories" className={item}>Categories <span aria-hidden className="text-muted">›</span></Link>
        <Link to="/settings/reminders" className={item}>Reminders <span aria-hidden className="text-muted">›</span></Link>
        <label className={item}>
          <span>Theme</span>
          <select value={pref} onChange={(e) => setPref(e.target.value as ThemePref)} className="h-11 rounded-lg border border-line bg-surface-2 px-2">
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <button onClick={() => void signOut()} className={`${item} w-full text-money-red`}>Log out</button>
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
          <Route path="/settings/reminders" element={<RemindersScreen />} />
          <Route path="*" element={<Navigate to="/settings" replace />} />
        </Routes>
      </Suspense>
    </div>
  )
}
