import { useCallback, useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { parseFilters, serializeFilters, toRpcFilters, type ActivityFilters } from '@/features/activity/filters'

/** Filters from a query string as a tab uses them: no date and no search text. */
export function tabFiltersFromSearch(search: string): ActivityFilters {
  const f = parseFilters(new URLSearchParams(search))
  delete f.preset; delete f.from; delete f.to; delete f.q
  return f
}

/** Filters as sent to a month RPC (no date: the RPC applies the month). */
export function tabRpcFilters(filters: ActivityFilters): Record<string, unknown> {
  const out = toRpcFilters(filters, '2000-01-01', '2000-01')
  delete out.from; delete out.to
  return out
}

/**
 * Filters for a tab whose date comes from the month switcher (Home, Calendar): they live in that tab's URL, and because tabs stay mounted
 * the last query string is also kept in the UI store and used while the tab is in the background. Date and search text are dropped.
 */
export function useTabFilters(path: string, stored: string, setStored: (s: string) => void) {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const active = pathname === path

  useEffect(() => {
    if (active) setStored(search)
  }, [active, search, setStored])

  const filters = useMemo<ActivityFilters>(() => tabFiltersFromSearch(active ? search : stored), [active, search, stored])

  const setFilters = useCallback((next: ActivityFilters) => {
    const qs = serializeFilters({ ...next, preset: undefined, q: undefined }).toString()
    setStored(qs ? `?${qs}` : '')
    navigate({ pathname: path, search: qs }, { replace: true })
  }, [navigate, path, setStored])

  /** Filters as sent to the RPC (no date: the RPC applies the month). */
  const rpc = useMemo(() => tabRpcFilters(filters), [filters])

  return { filters, setFilters, rpc }
}
