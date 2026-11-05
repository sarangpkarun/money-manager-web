import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Category, InsertRow, UpdateRow } from '@/lib/db'
import { qk } from '@/lib/queryKeys'
import { supabase } from '@/lib/supabase'
import { reorderUpdates } from '@/features/settings/reorder'

export function useCategories() {
  return useQuery({
    queryKey: qk.categories,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase.from('categories').select('*').order('sort').order('name')
      if (error) throw error
      return data
    },
  })
}

function useInvalidateCategories() {
  const qc = useQueryClient()
  // list rows carry the category name/icon, so activity is refreshed too
  return () => Promise.all([qc.invalidateQueries({ queryKey: qk.categories }), qc.invalidateQueries({ queryKey: qk.activity })])
}

export function useSaveCategory() {
  const done = useInvalidateCategories()
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: InsertRow<'categories'> & UpdateRow<'categories'> }) => {
      const q = id
        ? supabase.from('categories').update(values).eq('id', id)
        : supabase.from('categories').insert(values as InsertRow<'categories'>)
      const { error } = await q
      if (error) throw error
    },
    onSettled: done,
  })
}

export function useArchiveCategory() {
  const done = useInvalidateCategories()
  return useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase.from('categories').update({ archived }).eq('id', id)
      if (error) throw error
    },
    onSettled: done,
  })
}

export function useReorderCategories() {
  const done = useInvalidateCategories()
  return useMutation({
    mutationFn: async ({ items, id, dir }: { items: Category[]; id: string; dir: 'up' | 'down' }) => {
      const updates = reorderUpdates(items, id, dir)
      const results = await Promise.all(updates.map((u) => supabase.from('categories').update({ sort: u.sort }).eq('id', u.id)))
      const failed = results.find((r) => r.error)
      if (failed?.error) throw failed.error
    },
    onSettled: done,
  })
}
