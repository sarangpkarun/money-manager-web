import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ update: vi.fn(), eq: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ update: (p: unknown) => { m.update(p); return { eq: m.eq } } }) } }))

import { useTickTask } from './queries'

const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
beforeEach(() => { vi.clearAllMocks(); m.eq.mockResolvedValue({ error: null }) })

describe('useTickTask', () => {
  it('a repeating task moves to its next date and keeps its reminder time of day there', async () => {
    const { result } = renderHook(() => useTickTask(), { wrapper: wrap })
    const r = await act(() => result.current.mutateAsync({ id: 'n', date: '2026-11-02', repeat_rule: 'weekly', done: false, remind_at: '2026-11-02T03:00:00.000Z', timezone: 'Asia/Kolkata' }))
    expect(m.update).toHaveBeenCalledWith({ date: '2026-11-09', remind_at: '2026-11-09T03:00:00.000Z' })
    expect(r).toEqual({ movedTo: '2026-11-09', undo: { id: 'n', patch: { date: '2026-11-02', remind_at: '2026-11-02T03:00:00.000Z' } } })
  })
  it('the reminder follows the wall clock across a daylight-saving change', async () => {
    const { result } = renderHook(() => useTickTask(), { wrapper: wrap })
    // 09:00 New York on 25 Oct (EDT = 13:00Z), weekly: 1 Nov 09:00 is EST = 14:00Z
    await act(() => result.current.mutateAsync({ id: 'n', date: '2026-10-25', repeat_rule: 'weekly', done: false, remind_at: '2026-10-25T13:00:00.000Z', timezone: 'America/New_York' }))
    expect(m.update).toHaveBeenCalledWith({ date: '2026-11-01', remind_at: '2026-11-01T14:00:00.000Z' })
  })
  it('without a reminder only the date moves; a one-off task toggles done', async () => {
    const { result } = renderHook(() => useTickTask(), { wrapper: wrap })
    await act(() => result.current.mutateAsync({ id: 'n', date: '2026-11-02', repeat_rule: 'daily', done: false }))
    expect(m.update).toHaveBeenLastCalledWith({ date: '2026-11-03' })
    const r = await act(() => result.current.mutateAsync({ id: 'n', date: '2026-11-02', repeat_rule: null, done: false }))
    expect(m.update).toHaveBeenLastCalledWith({ done: true })
    expect(r).toEqual({ movedTo: null, undo: { id: 'n', patch: { done: false } } })
  })
  it('surfaces a server error', async () => {
    m.eq.mockResolvedValue({ error: new Error('denied') })
    const { result } = renderHook(() => useTickTask(), { wrapper: wrap })
    await expect(act(() => result.current.mutateAsync({ id: 'n', date: '2026-11-02', repeat_rule: null, done: false }))).rejects.toThrow('denied')
  })
})
