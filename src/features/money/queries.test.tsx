import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: m.rpc } }))

import { useCreatePlan, useExtraPayment, usePlanEdit, useRecordPayment } from './queries'

const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
beforeEach(() => { vi.clearAllMocks(); m.rpc.mockResolvedValue({ data: {}, error: null }) })

const args = () => m.rpc.mock.calls[0]?.[1] as Record<string, unknown>

/**
 * PostgREST resolves a function by the argument NAMES it receives; a key that is missing (undefined is dropped by JSON)
 * for a parameter without a SQL default makes the call fail with "could not find the function". These guard that.
 */
describe('RPC payloads', () => {
  it('create_entry_with_plan sends every parameter, nulls included', async () => {
    const { result } = renderHook(() => useCreatePlan(), { wrapper: wrap })
    await act(() => result.current.mutateAsync({
      id: 'i', kind: 'emi_purchase', person_id: null, party: 'Croma', title: 'Phone', principal_paise: 5_400_000, down_paise: 600_000, account_id: 'a',
      category_id: null, start_date: '2026-12-01', interest: 'reducing', rate_bps: 1500, no_cost: true, rows: [],
    }))
    expect(m.rpc.mock.calls[0]?.[0]).toBe('create_entry_with_plan')
    const a = args()
    for (const k of ['p_id', 'p_kind', 'p_person', 'p_party', 'p_title', 'p_principal', 'p_down', 'p_account', 'p_category', 'p_start', 'p_interest', 'p_rate_bps', 'p_no_cost', 'p_rows'])
      expect(Object.keys(a), k).toContain(k)
    expect(JSON.parse(JSON.stringify(a))).toMatchObject({ p_person: null, p_category: null, p_party: 'Croma' })
  })

  it('plan_extra_payment sends p_mode and p_note even when empty', async () => {
    const { result } = renderHook(() => useExtraPayment(), { wrapper: wrap })
    await act(() => result.current.mutateAsync({ id: 'x', entry_id: 'e', amount_paise: 100, paid_on: '2026-12-01', account_id: 'a', base: [], rows: [] }))
    expect(JSON.parse(JSON.stringify(args()))).toMatchObject({ p_mode: null, p_note: null, p_id: 'x', p_entry: 'e', p_amount: 100, p_base: [], p_rows: [] })
  })

  it('record_payment carries the target row; omitted optionals are fine (they have SQL defaults)', async () => {
    const { result } = renderHook(() => useRecordPayment(), { wrapper: wrap })
    await act(() => result.current.mutateAsync({ id: 'p', entry_id: 'e', amount_paise: 100, paid_on: '2026-12-01', account_id: 'a', target_seq: 3 }))
    expect(args()).toMatchObject({ p_target_seq: 3, p_entry: 'e' })
  })

  it('skip and change call their own functions with base and rows', async () => {
    const skip = renderHook(() => usePlanEdit('skip'), { wrapper: wrap })
    await act(() => skip.result.current.mutateAsync({ entryId: 'e', base: [], rows: [] }))
    expect(m.rpc.mock.calls[0]?.[0]).toBe('plan_skip_month')
    m.rpc.mockClear()
    const change = renderHook(() => usePlanEdit('change'), { wrapper: wrap })
    await act(() => change.result.current.mutateAsync({ entryId: 'e', base: [], rows: [] }))
    expect(m.rpc.mock.calls[0]?.[0]).toBe('plan_change_amount')
    expect(args()).toEqual({ p_entry: 'e', p_base: [], p_rows: [] })
  })

  it('surfaces a server error', async () => {
    m.rpc.mockResolvedValue({ data: null, error: new Error('this plan changed, please reload') })
    const { result } = renderHook(() => usePlanEdit('skip'), { wrapper: wrap })
    await expect(act(() => result.current.mutateAsync({ entryId: 'e', base: [], rows: [] }))).rejects.toThrow('changed, please reload')
  })
})
