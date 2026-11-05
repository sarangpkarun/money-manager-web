import { useCallback, useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useUi } from '@/lib/uiStore'
import { parseFilters, serializeFilters, toRpcFilters, type ActivityFilters } from '@/features/activity/filters'

/** Home filters live in the URL at "/" (the month comes from the month switcher, so any date part is dropped). */
export function useHomeFilters() {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const stored = useUi((s) => s.homeSearch)
  const setStored = useUi((s) => s.setHomeSearch)
  const active = pathname === '/'

  useEffect(() => {
    if (active) setStored(search)
  }, [active, search, setStored])

  const filters = useMemo<ActivityFilters>(() => {
    const f = parseFilters(new URLSearchParams(active ? search : stored))
    delete f.preset; delete f.from; delete f.to; delete f.q
    return f
  }, [active, search, stored])

  const setFilters = useCallback((next: ActivityFilters) => {
    const qs = serializeFilters({ ...next, preset: undefined, q: undefined }).toString()
    setStored(qs ? `?${qs}` : '')
    navigate({ pathname: '/', search: qs }, { replace: true })
  }, [navigate, setStored])

  /** Filters as sent to dashboard_summary (no date: the RPC applies the month). */
  const rpc = useMemo(() => {
    const out = toRpcFilters(filters, '2000-01-01', '2000-01')
    delete out.from; delete out.to
    return out
  }, [filters])

  return { filters, setFilters, rpc }
}
