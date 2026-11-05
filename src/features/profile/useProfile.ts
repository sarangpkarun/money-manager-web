import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import type { UpdateRow } from '@/lib/db'

export function useProfile() {
  const { session } = useAuth()
  const uid = session?.user.id
  return useQuery({
    queryKey: ['profile', uid],
    enabled: !!uid,
    // settings change often and other screens (reminders, display) depend on them: always revalidate after the cached copy paints
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', uid!).single()
      if (error) throw error
      return data
    },
  })
}

/** Saves profile fields (reminders, display, name …) and keeps the cached profile in step. */
export function useUpdateProfile() {
  const { session } = useAuth()
  const uid = session?.user.id
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: UpdateRow<'profiles'>) => {
      const { data, error } = await supabase.from('profiles').update(patch).eq('id', uid!).select('*').single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => qc.setQueryData(['profile', uid], data),
  })
}
