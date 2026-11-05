import PushSpike from '@/features/profile/PushSpike'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/ui/EmptyState'
import { useAuth } from '@/features/auth/AuthProvider'
import { useProfile } from '@/features/profile/useProfile'
import { useTheme, type ThemePref } from '@/lib/theme'

export default function HomeScreen() {
  const { signOut } = useAuth()
  const { data: profile } = useProfile()
  const { pref, setPref } = useTheme()
  return (
    <div>
      <div className="flex items-center justify-between px-4 pt-6">
        <h1 className="text-3xl font-bold">Hello{profile?.name ? `, ${profile.name}` : ''}</h1>
        <Link to="/settings" aria-label="Settings" className="flex h-11 w-11 items-center justify-center rounded-full bg-accent font-semibold text-white">
          {(profile?.name ?? '?').slice(0, 1).toUpperCase()}
        </Link>
      </div>
      <EmptyState title="Your dashboard is coming" hint="Add your first expense with the + button once Quick Add lands." />
      <div className="mx-4 space-y-3 rounded-2xl bg-surface p-4">
        <label className="flex items-center justify-between">
          <span>Theme</span>
          <select value={pref} onChange={(e) => setPref(e.target.value as ThemePref)}
                  className="h-11 rounded-lg border border-line bg-surface-2 px-2">
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <button onClick={() => void signOut()} className="h-11 w-full rounded-lg bg-surface-2 text-money-red">Log out</button>
      </div>
      <PushSpike />
    </div>
  )
}
