import { useInfiniteQuery, useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import type { Entry, InsertRow, PayMode, Payment, Person, ScheduleItem } from '@/lib/db'
import type { Json } from '@/lib/database.types'
import { qk } from '@/lib/queryKeys'
import { supabase } from '@/lib/supabase'
import type { HistoryRow, MoneyOverview, PersonBalance } from './types'
import type { rowsFull, rowsPayload } from '@/lib/plan'

export function usePeople() {
  return useQuery({
    queryKey: qk.people,
    staleTime: 0, // a person added elsewhere must never be missing from the picker
    queryFn: async (): Promise<Person[]> => {
      const { data, error } = await supabase.from('people').select('*').order('name')
      if (error) throw error
      return data
    },
  })
}

export function usePeopleBalances() {
  return useQuery({
    queryKey: qk.peopleBalances,
    staleTime: 0,
    queryFn: async (): Promise<PersonBalance[]> => {
      const { data, error } = await supabase.from('people_balances').select('*').order('name')
      if (error) throw error
      return data as unknown as PersonBalance[]
    },
  })
}

/** Open entries and totals. Cached copy paints first, then it revalidates. */
export function useMoneyOverview(today: string) {
  return useQuery({
    queryKey: qk.moneyOverview(today),
    staleTime: 0,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<MoneyOverview> => {
      const { data, error } = await supabase.rpc('money_overview', { p_today: today })
      if (error) throw error
      return data as unknown as MoneyOverview
    },
  })
}

const HISTORY_PAGE = 30
interface HistoryCursor { settled_on: string; id: string }

export function useMoneyHistory() {
  return useInfiniteQuery({
    queryKey: qk.moneyHistory,
    staleTime: 0,
    initialPageParam: null as HistoryCursor | null,
    queryFn: async ({ pageParam }): Promise<HistoryRow[]> => {
      const { data, error } = await supabase.rpc('money_history', { p_limit: HISTORY_PAGE, p_cursor: (pageParam ?? undefined) as Json | undefined })
      if (error) throw error
      return data as unknown as HistoryRow[]
    },
    getNextPageParam: (last): HistoryCursor | undefined => {
      const tail = last[last.length - 1]
      return last.length < HISTORY_PAGE || !tail ? undefined : { settled_on: tail.settled_on, id: tail.id }
    },
  })
}

export interface EntryDetail extends Entry {
  schedule_items: ScheduleItem[]
  payments: Payment[]
  people: Pick<Person, 'id' | 'name' | 'phone'> | null
}

export function useEntry(id: string | undefined) {
  return useQuery({
    queryKey: qk.entry(id ?? ''),
    enabled: !!id,
    staleTime: 0,
    queryFn: async (): Promise<EntryDetail | null> => {
      const { data, error } = await supabase.from('entries').select('*, schedule_items(*), payments(*), people(id,name,phone)').eq('id', id!).maybeSingle()
      if (error) throw error
      return data as unknown as EntryDetail | null
    },
  })
}

/** Anything that changes money, people or balances: refetch the screens that show them. */
function useRefreshMoney() {
  const qc = useQueryClient()
  return () =>
    Promise.all([qk.money, qk.people, qk.peopleBalances, qk.dashboardAll, qk.balances, qk.activity, ['activity-summary'], qk.recent].map((queryKey) =>
      qc.invalidateQueries({ queryKey })))
}

export interface NewEntry {
  id: string
  kind: 'lent' | 'borrowed'
  person_id: string
  title: string
  amount_paise: number
  account_id: string
  start_date: string
  due_date?: string | null
  interest?: 'none' | 'flat' | 'simple'
  rate_bps?: number
  notes?: string | null
}

export function useCreateEntry() {
  const refresh = useRefreshMoney()
  return useMutation({
    mutationFn: async (i: NewEntry) => {
      const { data, error } = await supabase.rpc('create_entry', {
        p_id: i.id, p_kind: i.kind, p_person: i.person_id, p_title: i.title, p_amount: i.amount_paise, p_account: i.account_id,
        p_start: i.start_date, p_due: i.due_date ?? undefined, p_interest: i.interest ?? 'none', p_rate_bps: i.rate_bps ?? 0, p_notes: i.notes ?? undefined,
      })
      if (error) throw error
      return data
    },
    onSettled: refresh,
  })
}

export interface NewPayment {
  id: string
  entry_id: string
  amount_paise: number
  paid_on: string
  account_id: string
  mode?: PayMode | null
  note?: string | null
  /** pay this plan row first; the rest flows to the earliest unpaid rows */
  target_seq?: number | null
}

export function useRecordPayment() {
  const refresh = useRefreshMoney()
  return useMutation({
    mutationFn: async (p: NewPayment) => {
      const { data, error } = await supabase.rpc('record_payment', {
        p_id: p.id, p_entry: p.entry_id, p_amount: p.amount_paise, p_paid_on: p.paid_on, p_account: p.account_id,
        p_mode: p.mode ?? undefined, p_note: p.note ?? undefined, p_target_seq: p.target_seq ?? undefined,
      })
      if (error) throw error
      return data
    },
    onSettled: refresh,
  })
}

export interface DeletedPayment {
  /** id to record it again with (Undo) */
  id: string
  entry_id: string
  amount_paise: number
  paid_on: string
  account_id: string | null
  mode: PayMode | null
  note: string | null
  /** the plan row it was aimed at, when it was a single-row payment (multi-part payments are re-allocated from the earliest row) */
  target_seq: number | null
}

/** Deletes the whole cash movement the payment belongs to. Resolves with what is needed to record it again (Undo). */
export function useDeletePayment() {
  const refresh = useRefreshMoney()
  return useMutation({
    mutationFn: async (id: string): Promise<DeletedPayment> => {
      const { data: p, error: e1 } = await supabase.from('payments').select('*').eq('id', id).single()
      if (e1) throw e1
      let parts: { amount_paise: number; seq: number | null }[] = [{ amount_paise: p.amount_paise, seq: null }]
      if (p.txn_id) {
        const { data, error } = await supabase.from('payments').select('amount_paise, schedule_items(seq)').eq('txn_id', p.txn_id)
        if (error) throw error
        parts = (data as unknown as { amount_paise: number; schedule_items: { seq: number } | null }[]).map((x) => ({ amount_paise: x.amount_paise, seq: x.schedule_items?.seq ?? null }))
      }
      const { error } = await supabase.rpc('delete_payment', { p_id: id })
      if (error) throw error
      return {
        id: p.id, entry_id: p.entry_id, amount_paise: parts.reduce((s, x) => s + x.amount_paise, 0), paid_on: p.paid_on, account_id: p.account_id,
        mode: p.mode, note: p.note, target_seq: parts.length === 1 ? (parts[0]?.seq ?? null) : null,
      }
    },
    onSettled: refresh,
  })
}

export function useMarkUnpaid() {
  const refresh = useRefreshMoney()
  return useMutation({
    mutationFn: async (entryId: string) => {
      const { error } = await supabase.rpc('mark_unpaid', { p_entry: entryId })
      if (error) throw error
    },
    onSettled: refresh,
  })
}

export interface EntryPatch { title?: string; notes?: string | null; person_id?: string; due_date?: string | null }

export function useUpdateEntry() {
  const refresh = useRefreshMoney()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: EntryPatch }) => {
      const { error } = await supabase.rpc('update_entry', { p_id: id, p_patch: patch as Json })
      if (error) throw error
    },
    onSettled: refresh,
  })
}

export function useDeleteEntry() {
  const refresh = useRefreshMoney()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_entry', { p_id: id })
      if (error) throw error
    },
    onSettled: refresh,
  })
}

type PersonValues = Pick<InsertRow<'people'>, 'name' | 'phone' | 'email' | 'notes' | 'archived'>

export function useSavePerson() {
  const refresh = useRefreshMoney()
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: PersonValues }): Promise<Person> => {
      const q = id ? supabase.from('people').update(values).eq('id', id) : supabase.from('people').insert(values)
      const { data, error } = await q.select('*').single()
      if (error) throw error
      return data
    },
    onSettled: refresh,
  })
}

export function useMergePeople() {
  const refresh = useRefreshMoney()
  return useMutation({
    mutationFn: async ({ keep, drop }: { keep: string; drop: string }) => {
      const { error } = await supabase.rpc('merge_people', { p_keep: keep, p_drop: drop })
      if (error) throw error
    },
    onSettled: refresh,
  })
}

export function useImportPeople() {
  const refresh = useRefreshMoney()
  return useMutation({
    mutationFn: async (rows: { name: string; phone: string | null }[]) => {
      if (rows.length === 0) return 0
      const { error } = await supabase.from('people').insert(rows.map((r) => ({ name: r.name, phone: r.phone })))
      if (error) throw error
      return rows.length
    },
    onSettled: refresh,
  })
}

export interface NewPlan {
  id: string
  kind: 'lent' | 'borrowed' | 'emi_purchase' | 'instalment'
  person_id: string | null
  party: string | null
  title: string
  principal_paise: number
  down_paise: number
  account_id: string
  category_id: string | null
  start_date: string
  interest: 'none' | 'flat' | 'simple' | 'reducing'
  rate_bps: number
  no_cost: boolean
  rows: ReturnType<typeof rowsPayload>
}

export function useCreatePlan() {
  const refresh = useRefreshMoney()
  return useMutation({
    mutationFn: async (i: NewPlan) => {
      const { data, error } = await supabase.rpc('create_entry_with_plan', {
        p_id: i.id, p_kind: i.kind, p_person: (i.person_id ?? undefined) as string, p_party: (i.party ?? undefined) as string, p_title: i.title,
        p_principal: i.principal_paise, p_down: i.down_paise, p_account: i.account_id, p_category: (i.category_id ?? undefined) as string,
        p_start: i.start_date, p_interest: i.interest, p_rate_bps: i.rate_bps, p_no_cost: i.no_cost, p_rows: i.rows as Json,
      })
      if (error) throw error
      return data
    },
    onSettled: refresh,
  })
}

type Rows = ReturnType<typeof rowsFull>

/** Skip month / change amount: base = the rows the screen started from, rows = the new rows. */
export function usePlanEdit(kind: 'skip' | 'change') {
  const refresh = useRefreshMoney()
  return useMutation({
    mutationFn: async ({ entryId, base, rows }: { entryId: string; base: Rows; rows: Rows }) => {
      const { error } = await supabase.rpc(kind === 'skip' ? 'plan_skip_month' : 'plan_change_amount', { p_entry: entryId, p_base: base as Json, p_rows: rows as Json })
      if (error) throw error
    },
    onSettled: refresh,
  })
}

export interface ExtraPayment {
  id: string
  entry_id: string
  amount_paise: number
  paid_on: string
  account_id: string
  mode?: PayMode | null
  note?: string | null
  base: Rows
  rows: Rows
}

export function useExtraPayment() {
  const refresh = useRefreshMoney()
  return useMutation({
    mutationFn: async (x: ExtraPayment) => {
      const { error } = await supabase.rpc('plan_extra_payment', {
        p_id: x.id, p_entry: x.entry_id, p_amount: x.amount_paise, p_paid_on: x.paid_on, p_account: x.account_id,
        p_mode: (x.mode ?? undefined) as PayMode, p_note: (x.note ?? undefined) as string, p_base: x.base as Json, p_rows: x.rows as Json,
      })
      if (error) throw error
    },
    onSettled: refresh,
  })
}
