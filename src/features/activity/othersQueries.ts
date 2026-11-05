import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Json } from '@/lib/database.types'
import type { OtherPending, Transaction } from '@/lib/db'
import { qk } from '@/lib/queryKeys'
import { supabase } from '@/lib/supabase'

/** Everything a purchase paid for friends touches: lists, totals, balances, the friends' entries and the calendar. */
function useRefreshAll() {
  const qc = useQueryClient()
  return () =>
    Promise.all([qk.activity, ['activity-summary'], qk.dashboardAll, qk.calendarAll, qk.balances, qk.recent, qk.money, qk.people, qk.peopleBalances, ['title-suggestions']]
      .map((queryKey) => qc.invalidateQueries({ queryKey })))
}

/** One friend of a purchase, in the shape `quick_add_with_others` takes. */
export interface OtherInput {
  person_id: string
  amount_paise: number
  due_date?: string
  rows?: unknown[]
}

export interface NewExpenseForOthers {
  id: string
  amount_paise: number
  date: string
  account_id: string
  category_id?: string | null
  title?: string | null
  place?: string | null
  notes?: string | null
  tags?: string[]
  others: OtherInput[]
}

const addArgs = (i: NewExpenseForOthers) => ({
  p_id: i.id, p_amount: i.amount_paise, p_date: i.date, p_account: i.account_id, p_category: (i.category_id ?? undefined) as string, p_title: (i.title ?? undefined) as string,
  p_place: (i.place ?? undefined) as string, p_notes: (i.notes ?? undefined) as string, p_tags: i.tags ?? [], p_others: i.others as unknown as Json,
})

/** A purchase together with what friends owe, in one transaction. Rows reload from the server (no optimistic insert). */
export function useAddExpenseForOthers() {
  const refresh = useRefreshAll()
  return useMutation({
    mutationFn: async (i: NewExpenseForOthers) => {
      const { data, error } = await supabase.rpc('quick_add_with_others', addArgs(i))
      if (error) throw error
      return data as unknown as { txn: Transaction; entries: string[] }
    },
    onSettled: refresh,
  })
}

export interface PurchaseSnapshot {
  txn: Transaction
  others: { person_id: string; amount_paise: number; due_date: string | null; rows: unknown[] }[]
}

/** Deletes a purchase that friends owe on. The server refuses (with a clear message) once anyone has paid. Resolves with what Undo needs. */
export function useDeleteTransactionWithOthers() {
  const refresh = useRefreshAll()
  return useMutation({
    mutationFn: async (id: string): Promise<PurchaseSnapshot> => {
      const { data, error } = await supabase.rpc('delete_transaction', { p_id: id })
      if (error) throw error
      return data as unknown as PurchaseSnapshot
    },
    onSettled: refresh,
  })
}

/** Undo for the delete above: the same purchase (same id) and the friends again. */
export function useRestorePurchase() {
  const refresh = useRefreshAll()
  return useMutation({
    mutationFn: async (s: PurchaseSnapshot) => {
      const { error } = await supabase.rpc('quick_add_with_others', addArgs({
        id: s.txn.id, amount_paise: s.txn.amount_paise, date: s.txn.date, account_id: s.txn.account_id as string, category_id: s.txn.category_id, title: s.txn.title,
        place: s.txn.place, notes: s.txn.notes, tags: s.txn.tags ?? [],
        others: s.others.map((o) => ({ person_id: o.person_id, amount_paise: o.amount_paise, rows: o.rows })),
      }))
      if (error) throw error
    },
    onSettled: refresh,
  })
}

export interface ExpensePatch {
  title?: string | null
  place?: string | null
  notes?: string | null
  tags?: string[]
  category_id?: string | null
  date?: string
  account_id?: string
  amount_paise?: number
}

/** A friend as sent when editing: `entry_id` present = an existing friend (amount/due date may change). */
export interface EditOther { entry_id?: string; person_id: string; amount_paise: number; due_date?: string }

/** Edits a purchase that friends owe on. `others` null leaves the friends alone. The server explains what is blocked. */
export function useUpdateExpenseForOthers() {
  const refresh = useRefreshAll()
  return useMutation({
    mutationFn: async ({ id, patch, others }: { id: string; patch: ExpensePatch; others: EditOther[] | null }) => {
      const { data, error } = await supabase.rpc('update_expense_for_others', { p_id: id, p_patch: patch as unknown as Json, p_others: others as unknown as Json })
      if (error) throw error
      return data as unknown as { txn: Transaction; others: OtherPending[] }
    },
    onSettled: refresh,
  })
}
