import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Account, AccountBalance, InsertRow, UpdateRow } from '@/lib/db'
import { qk } from '@/lib/queryKeys'
import { supabase } from '@/lib/supabase'
import { reorderUpdates } from '@/features/settings/reorder'

export function useAccounts() {
  return useQuery({
    queryKey: qk.accounts,
    // always revalidate on open: the persisted cache paints instantly, then silently refreshes (a new account must never be missing)
    staleTime: 0,
    queryFn: async (): Promise<Account[]> => {
      const { data, error } = await supabase.from('accounts').select('*').order('sort').order('name')
      if (error) throw error
      return data
    },
  })
}

export function useAccountBalances() {
  return useQuery({
    queryKey: qk.balances,
    staleTime: 0,
    queryFn: async (): Promise<AccountBalance[]> => {
      const { data, error } = await supabase.from('account_balances').select('*').order('sort').order('name')
      if (error) throw error
      return data
    },
  })
}

function useInvalidateAccounts() {
  const qc = useQueryClient()
  return () => Promise.all([qc.invalidateQueries({ queryKey: qk.accounts }), qc.invalidateQueries({ queryKey: qk.balances })])
}

export function useSaveAccount() {
  const done = useInvalidateAccounts()
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: InsertRow<'accounts'> & UpdateRow<'accounts'> }) => {
      const q = id
        ? supabase.from('accounts').update(values).eq('id', id)
        : supabase.from('accounts').insert(values as InsertRow<'accounts'>)
      const { error } = await q
      if (error) throw error
    },
    onSettled: done,
  })
}

export function useArchiveAccount() {
  const done = useInvalidateAccounts()
  return useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase.from('accounts').update({ archived }).eq('id', id)
      if (error) throw error
    },
    onSettled: done,
  })
}

export function useReorderAccounts() {
  const done = useInvalidateAccounts()
  return useMutation({
    mutationFn: async ({ items, id, dir }: { items: Account[]; id: string; dir: 'up' | 'down' }) => {
      const updates = reorderUpdates(items, id, dir)
      const results = await Promise.all(updates.map((u) => supabase.from('accounts').update({ sort: u.sort }).eq('id', u.id)))
      const failed = results.find((r) => r.error)
      if (failed?.error) throw failed.error
    },
    onSettled: done,
  })
}
