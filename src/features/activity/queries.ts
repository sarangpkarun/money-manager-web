import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import type { Json } from '@/lib/database.types'
import type { Account, ActivityRow, Category, Transaction } from '@/lib/db'
import { qk } from '@/lib/queryKeys'
import { supabase } from '@/lib/supabase'
import { insertIntoPages, matchesFilters, removeFromPages, rowFromInput, type NewTxnInput, type RpcFilters } from './cache'

export const PAGE_SIZE = 50

export interface Summary {
  spent: number
  received: number
  net: number
  by_account: { account_id: string; name: string; spent: number; received: number }[]
}

interface Cursor { date: string; created_at: string; id: string }
type ListData = InfiniteData<ActivityRow[], Cursor | null>

export function useActivity(filters: RpcFilters) {
  return useInfiniteQuery({
    queryKey: qk.activityList(filters),
    initialPageParam: null as Cursor | null,
    placeholderData: keepPreviousData,
    queryFn: async ({ pageParam }): Promise<ActivityRow[]> => {
      const { data, error } = await supabase.rpc('search_transactions', {
        p_filters: filters as Json, p_limit: PAGE_SIZE, p_cursor: (pageParam ?? undefined) as Json | undefined,
      })
      if (error) throw error
      return data as ActivityRow[]
    },
    getNextPageParam: (last): Cursor | undefined => {
      const tail = last[last.length - 1]
      return last.length < PAGE_SIZE || !tail ? undefined : { date: tail.date, created_at: tail.created_at as string, id: tail.id }
    },
  })
}

export function useActivitySummary(filters: RpcFilters) {
  return useQuery({
    queryKey: qk.summary(filters),
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<Summary> => {
      const { data, error } = await supabase.rpc('activity_summary', { p_filters: filters as Json })
      if (error) throw error
      return data as unknown as Summary
    },
  })
}

/** Recent transactions (kind, category, account, date) used to rank category chips and pick defaults. */
export function useRecentTransactions() {
  return useQuery({
    queryKey: qk.recent,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('transactions').select('kind,category_id,account_id,date')
        .in('kind', ['expense', 'income', 'transfer']).order('date', { ascending: false }).order('created_at', { ascending: false }).limit(300)
      if (error) throw error
      return data
    },
  })
}

export interface TitleSuggestion { title: string; category_id: string | null; account_id: string | null; place: string | null; last_date: string; uses: number }

export function useTitleSuggestions(prefix: string) {
  const p = prefix.trim()
  return useQuery({
    queryKey: qk.suggestions(p.toLowerCase()),
    enabled: p.length > 0,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<TitleSuggestion[]> => {
      const { data, error } = await supabase.rpc('title_suggestions', { p_prefix: p })
      if (error) throw error
      return data as TitleSuggestion[]
    },
  })
}

function useRefreshAll() {
  const qc = useQueryClient()
  return () =>
    Promise.all([qk.activity, ['activity-summary'], qk.dashboardAll, qk.calendarAll, qk.balances, qk.recent, ['title-suggestions']].map((queryKey) => qc.invalidateQueries({ queryKey })))
}

type Snapshots = [readonly unknown[], ListData | undefined][]

function snapshot(qc: ReturnType<typeof useQueryClient>): Snapshots {
  return qc.getQueriesData<ListData>({ queryKey: qk.activity })
}
function restore(qc: ReturnType<typeof useQueryClient>, s: Snapshots | undefined) {
  s?.forEach(([key, data]) => qc.setQueryData(key, data))
}

/** Adds a transaction. Optimistic: the row shows in every cached list it belongs to before the server answers. */
export function useAddTransaction() {
  const qc = useQueryClient()
  const refresh = useRefreshAll()
  return useMutation({
    mutationFn: async (i: NewTxnInput) => {
      const { data, error } = await supabase.rpc('quick_add_transaction', {
        p_id: i.id, p_kind: i.kind, p_amount: i.amount_paise, p_date: i.date, p_account: i.account_id,
        p_to_account: i.to_account_id ?? undefined, p_category: i.category_id ?? undefined, p_title: i.title ?? undefined,
        p_place: i.place ?? undefined, p_notes: i.notes ?? undefined, p_tags: i.tags ?? [],
      })
      if (error) throw error
      return data
    },
    onMutate: async (i) => {
      await qc.cancelQueries({ queryKey: qk.activity })
      const before = snapshot(qc)
      const row = rowFromInput(i, qc.getQueryData<Account[]>(qk.accounts), qc.getQueryData<Category[]>(qk.categories))
      for (const [key, data] of before) {
        if (!data || matchesFilters(row, (key[1] ?? {}) as RpcFilters) !== 'yes') continue
        qc.setQueryData<ListData>(key, { ...data, pages: insertIntoPages(data.pages, row) })
      }
      return { before }
    },
    onError: (_e, _i, ctx) => restore(qc, ctx?.before),
    onSettled: refresh,
  })
}

/** Deletes a transaction (optimistic) and resolves with the full original row so the caller can offer Undo. */
export function useDeleteTransaction() {
  const qc = useQueryClient()
  const refresh = useRefreshAll()
  return useMutation({
    mutationFn: async (id: string): Promise<Transaction> => {
      const { data: full, error: e1 } = await supabase.from('transactions').select('*').eq('id', id).single()
      if (e1) throw e1
      const { error } = await supabase.from('transactions').delete().eq('id', id)
      if (error) throw error
      return full
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: qk.activity })
      const before = snapshot(qc)
      for (const [key, data] of before) if (data) qc.setQueryData<ListData>(key, { ...data, pages: removeFromPages(data.pages, id) })
      return { before }
    },
    onError: (_e, _id, ctx) => restore(qc, ctx?.before),
    onSettled: refresh,
  })
}

/** Undo for delete: re-inserts the exact original row (same id and created_at). */
export function useRestoreTransaction() {
  const refresh = useRefreshAll()
  return useMutation({
    mutationFn: async (txn: Transaction) => {
      const { error } = await supabase.from('transactions').insert(txn)
      if (error) throw error
    },
    onSettled: refresh,
  })
}

export interface TxnPatch {
  kind?: 'expense' | 'income' | 'transfer'
  amount_paise?: number
  date?: string
  account_id?: string
  to_account_id?: string | null
  category_id?: string | null
  title?: string | null
  place?: string | null
  notes?: string | null
  tags?: string[]
}

export function useUpdateTransaction() {
  const refresh = useRefreshAll()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TxnPatch }) => {
      const { error } = await supabase.from('transactions').update(patch).eq('id', id)
      if (error) throw error
    },
    onSettled: refresh,
  })
}
