import { lazy, Suspense } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { PageHeader } from '@/ui/PageHeader'

const AccountsScreen = lazy(() => import('./AccountsScreen'))
const CategoriesScreen = lazy(() => import('./CategoriesScreen'))
const RemindersScreen = lazy(() => import('./RemindersScreen'))
const ProfileScreen = lazy(() => import('./ProfileScreen'))
const DisplayScreen = lazy(() => import('./DisplayScreen'))
const ExportScreen = lazy(() => import('./ExportScreen'))
const PrivacyScreen = lazy(() => import('./PrivacyScreen'))
const AboutScreen = lazy(() => import('./AboutScreen'))
const DeleteAccountScreen = lazy(() => import('./DeleteAccountScreen'))

const Row = ({ to, label, hint }: { to: string; label: string; hint?: string }) => (
  <Link to={to} className="flex min-h-14 items-center justify-between gap-3 px-4">
    <span><span className="block">{label}</span>{hint && <span className="block text-sm text-muted">{hint}</span>}</span>
    <span aria-hidden className="text-muted">›</span>
  </Link>
)

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-1 px-1 text-sm font-medium text-muted">{title}</h2>
      <div className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">{children}</div>
    </section>
  )
}

function SettingsHome() {
  const { signOut } = useAuth()
  return (
    <div>
      <PageHeader title="Settings" back="/" backLabel="Home" />
      <nav className="space-y-5 px-4 pb-8" aria-label="Settings">
        <Section title="You"><Row to="/settings/profile" label="Profile" hint="Name, time zone" /></Section>
        <Section title="Money">
          <Row to="/settings/accounts" label="Accounts" />
          <Row to="/settings/categories" label="Categories" />
        </Section>
        <Section title="App">
          <Row to="/settings/display" label="Display" hint="Numbers, dates, theme, Home cards" />
          <Row to="/settings/reminders" label="Reminders" hint="Notifications, quiet hours, summary" />
        </Section>
        <Section title="Data">
          <Row to="/settings/export" label="Export" hint="Download everything you have stored" />
          <Row to="/settings/privacy" label="Privacy" />
          <Row to="/settings/about" label="About" />
        </Section>
        <div className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">
          <button onClick={() => void signOut()} className="flex min-h-14 w-full items-center px-4 text-left text-money-red">Log out</button>
        </div>
        <div className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">
          <Link to="/settings/delete" className="flex min-h-14 items-center px-4 text-money-red">Delete account</Link>
        </div>
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
          <Route path="/settings/profile" element={<ProfileScreen />} />
          <Route path="/settings/display" element={<DisplayScreen />} />
          <Route path="/settings/export" element={<ExportScreen />} />
          <Route path="/settings/privacy" element={<PrivacyScreen />} />
          <Route path="/settings/about" element={<AboutScreen />} />
          <Route path="/settings/delete" element={<DeleteAccountScreen />} />
          <Route path="*" element={<Navigate to="/settings" replace />} />
        </Routes>
      </Suspense>
    </div>
  )
}
