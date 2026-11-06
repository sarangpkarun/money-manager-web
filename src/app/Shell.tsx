import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link, matchPath, Navigate, useLocation } from 'react-router-dom'
import { OfflineBanner } from '@/ui/OfflineBanner'
import { Toaster } from '@/ui/Toaster'
import { useAccounts } from '@/features/accounts/queries'
import { useRecentTransactions } from '@/features/activity/queries'
import { useCategories } from '@/features/categories/queries'
import { useProfile } from '@/features/profile/useProfile'
import { setDisplay, useDisplayVersion } from '@/lib/display'
import { useUi } from '@/lib/uiStore'
import HomeScreen from '@/features/home/HomeScreen'
import { tabFiltersFromSearch, tabRpcFilters } from '@/features/home/useTabFilters'
import { useToday } from '@/features/profile/useToday'
import { useQueryClient } from '@tanstack/react-query'

const CalendarScreen = lazy(() => import('@/features/calendar/CalendarScreen'))
const ActivityScreen = lazy(() => import('@/features/activity/ActivityScreen'))
const MoneyScreen = lazy(() => import('@/features/money/MoneyScreen'))
const SettingsRoutes = lazy(() => import('@/features/settings/SettingsRoutes'))
const EntryScreen = lazy(() => import('@/features/money/EntryScreen'))
const EmiSheet = lazy(() => import('@/features/money/plan/EmiSheet'))
const loadQuickAdd = () => import('@/features/quick-add/QuickAddSheet')
const QuickAddSheet = lazy(loadQuickAdd)

type TabKey = 'home' | 'calendar' | 'activity' | 'money'
const TAB_PATHS: Record<TabKey, string> = { home: '/', calendar: '/calendar', activity: '/activity', money: '/money' }
const SCREENS: Record<TabKey, () => ReactNode> = {
  home: () => <HomeScreen />,
  calendar: () => <CalendarScreen />,
  activity: () => <ActivityScreen />,
  money: () => <MoneyScreen />,
}

export function tabForPath(path: string): TabKey | null {
  const hit = (Object.entries(TAB_PATHS) as [TabKey, string][]).find(([, p]) => p === path)
  return hit ? hit[0] : null
}

/** Stays mounted once visited; hidden when inactive; scroll position saved/restored explicitly (Safari drops it on display:none). */
function TabPane({ active, children }: { active: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const saved = useRef(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (el && active) el.scrollTop = saved.current
  }, [active])
  return (
    <div
      ref={ref}
      hidden={!active}
      onScroll={(e) => {
        if (active) saved.current = e.currentTarget.scrollTop
      }}
      data-tab-scroll className="absolute inset-0 overflow-y-auto overscroll-contain pt-safe"
      style={{ paddingBottom: 'calc(64px + env(safe-area-inset-bottom))' }}
    >
      <Suspense fallback={<div className="p-4" aria-busy="true"><div className="h-8 w-40 animate-pulse rounded-lg bg-surface-2" /></div>}>
        {children}
      </Suspense>
    </div>
  )
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
  )
}

const ICONS: Record<TabKey, string> = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  activity: 'M4 6h16M4 12h16M4 18h10',
  money: 'M12 3v18M16 7.5C16 6 14.2 5 12 5S8 6 8 8s2 2.5 4 3 4 1 4 3-1.8 3-4 3-4-1-4-2.5',
}
const LABELS: Record<TabKey, string> = { home: 'Home', calendar: 'Calendar', activity: 'Activity', money: 'Money' }

function TabLink({ tab, active }: { tab: TabKey; active: boolean }) {
  const activitySearch = useUi((s) => s.activitySearch)
  const to = tab === 'activity' && !active ? `${TAB_PATHS.activity}${activitySearch}` : TAB_PATHS[tab]
  return (
    <Link to={to} aria-current={active ? 'page' : undefined}
          className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${active ? 'text-accent' : 'text-muted'}`}>
      <Icon d={ICONS[tab]} />
      {LABELS[tab]}
    </Link>
  )
}

/** Applies the profile's number and date format app-wide (see lib/display.ts). */
function DisplaySync() {
  const { data } = useProfile()
  const number = data?.number_format
  const date = data?.date_format
  useEffect(() => { setDisplay({ number, date }) }, [number, date])
  return null
}

/** Warms the caches Quick Add needs so the sheet opens with data already there. */
function Prefetch() {
  useAccounts()
  useCategories()
  useRecentTransactions()
  // the current month of the Calendar, so the tab (and its day sheet) opens with data already in the cache
  const qc = useQueryClient()
  const today = useToday()
  const month = useUi((s) => s.month)
  const stored = useUi((s) => s.calendarSearch)
  useEffect(() => {
    const id = window.setTimeout(() => {
      void import('@/features/calendar/queries').then((m) => qc.prefetchQuery(m.calendarMonthOptions(month, today, tabRpcFilters(tabFiltersFromSearch(stored)))))
    }, 2500)
    return () => window.clearTimeout(id)
  }, [qc, today, month, stored])
  return null
}

export function Shell() {
  useDisplayVersion((s) => s.version) // re-render every screen when the number or date format changes
  const { pathname } = useLocation()
  const tab = tabForPath(pathname)
  const { quickAddOpen, openQuickAdd, emiOpen, setEmiOpen } = useUi()
  const [sheetWarm, setSheetWarm] = useState(false)
  const [visited, setVisited] = useState<Set<TabKey>>(() => new Set(['home']))

  // Fetch the sheet chunk when idle (not part of the initial bundle), then keep it mounted.
  useEffect(() => {
    const id = window.setTimeout(() => void loadQuickAdd().then(() => setSheetWarm(true)), 1500)
    return () => window.clearTimeout(id)
  }, [])

  // Derived state: adjust during render (React-recommended) so a newly visited tab mounts immediately.
  if (tab && !visited.has(tab)) setVisited(new Set(visited).add(tab))

  const inSettings = pathname === '/settings' || pathname.startsWith('/settings/')
  const entryId = matchPath('/money/entry/:id', pathname)?.params.id
  if (!tab && !inSettings && !entryId) return <Navigate to="/" replace />

  return (
    <div className="fixed inset-0 bg-bg">
      <main className="absolute inset-0">
        {(Object.keys(TAB_PATHS) as TabKey[]).map(
          (k) => (visited.has(k) || k === tab) && (
            <TabPane key={k} active={k === tab}>{SCREENS[k]()}</TabPane>
          ),
        )}
      </main>

      <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-10 flex items-center border-t border-line bg-surface/95 backdrop-blur"
           style={{ minHeight: 'calc(64px + env(safe-area-inset-bottom))' }}>
        <TabLink tab="home" active={tab === 'home'} />
        <TabLink tab="calendar" active={tab === 'calendar'} />
        <button aria-label="Quick add" onClick={() => openQuickAdd()}
                className="mx-2 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-on-accent transition-transform active:scale-90">
          <Icon d="M12 5v14M5 12h14" />
        </button>
        <TabLink tab="activity" active={tab === 'activity'} />
        <TabLink tab="money" active={tab === 'money'} />
      </nav>

      {inSettings && <Suspense fallback={null}><SettingsRoutes /></Suspense>}
      {entryId && <Suspense fallback={null}><EntryScreen key={entryId} id={entryId} /></Suspense>}
      <Suspense fallback={null}>{(quickAddOpen || sheetWarm) && <QuickAddSheet />}</Suspense>
      <Suspense fallback={null}>{emiOpen && <EmiSheet open onClose={() => setEmiOpen(false)} />}</Suspense>
      <DisplaySync />
      <Prefetch />
      <OfflineBanner />
      <Toaster />
    </div>
  )
}
