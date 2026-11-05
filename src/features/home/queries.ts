import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { Json } from '@/lib/database.types'
import { qk } from '@/lib/queryKeys'
import { supabase } from '@/lib/supabase'
import { parseDashboard, type Dashboard } from './dashboardTypes'

/**
 * One RPC feeds the whole of Home. `staleTime: 0` + the persisted cache = stale-while-revalidate: the last result paints
 * immediately on launch and one background request refreshes it. Switching month keeps the old numbers until the new ones land.
 */
export function useDashboard(month: string, today: string, filters: Record<string, unknown>) {
  return useQuery({
    queryKey: qk.dashboard(month, filters),
    staleTime: 0,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<Dashboard> => {
      const { data, error } = await supabase.rpc('dashboard_summary', { p_month: month, p_today: today, p_filters: filters as Json })
      if (error) throw error
      return parseDashboard(data)
    },
  })
}
