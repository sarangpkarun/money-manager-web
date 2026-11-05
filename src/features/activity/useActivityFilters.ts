import { useCallback, useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useUi } from '@/lib/uiStore'
import { parseFilters, serializeFilters, type ActivityFilters } from './filters'

/**
 * Activity filters live in the URL (back/refresh keep them). The tab stays mounted while you are elsewhere, so the last
 * query string is also remembered in the UI store and restored when you return.
 */
export function useActivityFilters() {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const stored = useUi((s) => s.activitySearch)
  const setStored = useUi((s) => s.setActivitySearch)
  const active = pathname === '/activity'

  useEffect(() => {
    if (active) setStored(search)
  }, [active, search, setStored])

  const filters = useMemo(() => parseFilters(new URLSearchParams(active ? search : stored)), [active, search, stored])

  const setFilters = useCallback(
    (next: ActivityFilters) => {
      const qs = serializeFilters(next).toString()
      setStored(qs ? `?${qs}` : '')
      navigate({ pathname: '/activity', search: qs }, { replace: true })
    },
    [navigate, setStored],
  )
  return { filters, setFilters }
}
