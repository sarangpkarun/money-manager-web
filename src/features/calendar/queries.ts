import { keepPreviousData, queryOptions, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays } from '@/lib/dates'
import type { Json } from '@/lib/database.types'
import type { InsertRow, Row } from '@/lib/db'
import { qk } from '@/lib/queryKeys'
import { nextOccurrence } from '@/lib/repeat'
import { supabase } from '@/lib/supabase'
import { parseAgendaWindow, parseCalendarMonth, type AgendaWindow, type CalendarMonth } from './types'

export const AGENDA_DAYS = 30

/** Query options for a month (shared by the hook and the idle prefetch, so both use the same cache entry). */
export const calendarMonthOptions = (month: string, today: string, filters: Record<string, unknown>) =>
  queryOptions({
    queryKey: qk.calendarMonth(month, filters),
    staleTime: 0,
    queryFn: async (): Promise<CalendarMonth> => {
      const { data, error } = await supabase.rpc('calendar_month', { p_month: month, p_today: today, p_filters: filters as Json })
      if (error) throw error
      return parseCalendarMonth(data)
    },
  })

/** One RPC feeds the month grid AND the day sheet. staleTime 0 + the persisted cache = paint from cache, refresh in the background. */
export function useCalendarMonth(month: string, today: string, filters: Record<string, unknown>) {
  return useQuery({ ...calendarMonthOptions(month, today, filters), placeholderData: keepPreviousData })
}

/** The Agenda: 30-day windows, starting a few days before today, loaded forwards and backwards as you scroll. */
export function useAgenda(today: string) {
  return useInfiniteQuery({
    queryKey: [...qk.agenda, today],
    staleTime: 0,
    initialPageParam: addDays(today, -3),
    queryFn: async ({ pageParam }): Promise<AgendaWindow> => {
      const { data, error } = await supabase.rpc('calendar_agenda', { p_from: pageParam, p_to: addDays(pageParam, AGENDA_DAYS - 1), p_today: today })
      if (error) throw error
      return parseAgendaWindow(data)
    },
    getNextPageParam: (last) => addDays(last.to, 1),
    getPreviousPageParam: (first) => addDays(first.from, -AGENDA_DAYS),
  })
}

export type NoteRow = Row<'notes'>
export interface NoteValues {
  kind: 'note' | 'task'
  title: string
  body: string | null
  date: string
  repeat_rule: string | null
}

function useRefreshCalendar() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: qk.calendarAll })
}

export function useSaveNote() {
  const refresh = useRefreshCalendar()
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: NoteValues }): Promise<NoteRow> => {
      const q = id ? supabase.from('notes').update(values).eq('id', id) : supabase.from('notes').insert(values as InsertRow<'notes'>)
      const { data, error } = await q.select('*').single()
      if (error) throw error
      return data
    },
    onSettled: refresh,
  })
}

export function useDeleteNote() {
  const refresh = useRefreshCalendar()
  return useMutation({
    mutationFn: async (id: string): Promise<NoteRow> => {
      const { data, error: e1 } = await supabase.from('notes').select('*').eq('id', id).single()
      if (e1) throw e1
      const { error } = await supabase.from('notes').delete().eq('id', id)
      if (error) throw error
      return data
    },
    onSettled: refresh,
  })
}

/** Undo for delete: puts the exact row back. */
export function useRestoreNote() {
  const refresh = useRefreshCalendar()
  return useMutation({
    mutationFn: async (row: NoteRow) => {
      const { error } = await supabase.from('notes').insert(row as InsertRow<'notes'>)
      if (error) throw error
    },
    onSettled: refresh,
  })
}

export interface TickResult {
  /** what to put back to undo the tick */
  undo: { id: string; patch: { done?: boolean; date?: string } }
  /** for repeating tasks: the date it moved to */
  movedTo: string | null
}

/**
 * Ticks a task. A repeating one moves to its next occurrence (and stays open); a one-off toggles `done`.
 * Resolves with what is needed to undo it.
 */
export function useTickTask() {
  const refresh = useRefreshCalendar()
  return useMutation({
    mutationFn: async (n: { id: string; date: string; repeat_rule: string | null; done: boolean }): Promise<TickResult> => {
      const next = n.repeat_rule ? nextOccurrence(n.date, n.repeat_rule) : null
      const patch = next ? { date: next } : { done: !n.done }
      const { error } = await supabase.from('notes').update(patch).eq('id', n.id)
      if (error) throw error
      return { undo: { id: n.id, patch: next ? { date: n.date } : { done: n.done } }, movedTo: next }
    },
    onSettled: refresh,
  })
}

export function useUndoTick() {
  const refresh = useRefreshCalendar()
  return useMutation({
    mutationFn: async ({ id, patch }: TickResult['undo']) => {
      const { error } = await supabase.from('notes').update(patch).eq('id', id)
      if (error) throw error
    },
    onSettled: refresh,
  })
}
