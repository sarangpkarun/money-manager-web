import { useQuery } from '@tanstack/react-query'
import { qk } from '@/lib/queryKeys'
import { supabase } from '@/lib/supabase'
import { parseFacts, type InsightFacts } from './rules'

/** Facts for the Insights card. Own request (not part of the dashboard RPC) so Home's first paint never waits for it. */
export function useInsightFacts(today: string) {
  return useQuery({
    queryKey: qk.insights(today),
    staleTime: 0,
    queryFn: async (): Promise<InsightFacts> => {
      const { data, error } = await supabase.rpc('insight_facts', { p_today: today })
      if (error) throw error
      return parseFacts(data)
    },
  })
}
