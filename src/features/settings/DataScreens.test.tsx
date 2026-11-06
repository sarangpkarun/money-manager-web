import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToasts } from '@/ui/toastStore'

const m = vi.hoisted(() => ({
  tables: {} as Record<string, unknown[]>,
  tableError: null as string | null,
  saved: [] as { name: string; content: string; mime: string }[],
  saveResult: 'downloaded' as string,
  invoke: vi.fn(), signOut: vi.fn(), disablePush: vi.fn(), calls: [] as string[],
}))

vi.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ session: { user: { email: 'Sarang@Example.com' } }, signOut: vi.fn() }) }))
vi.mock('@/features/profile/useProfile', () => ({ useProfile: () => ({ data: { id: 'u1', name: 'Sarang', timezone: 'Asia/Kolkata' } }) }))
vi.mock('@/features/profile/useToday', () => ({ useToday: () => '2026-11-05' }))
vi.mock('@/lib/push', () => ({ disablePush: (...a: unknown[]) => { m.calls.push('push'); return m.disablePush(...a) } }))
vi.mock('@/lib/exportData', async () => {
  const real = await vi.importActual<typeof import('@/lib/exportData')>('@/lib/exportData')
  return { ...real, saveFile: async (name: string, content: string, mime: string) => { m.saved.push({ name, content, mime }); return m.saveResult } }
})
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (t: string) => ({
      select: () => ({
        order: () => ({
          range: async (from: number) => (m.tableError ? { data: null, error: { message: m.tableError } } : { data: from === 0 ? (m.tables[t] ?? []) : [], error: null }),
        }),
      }),
    }),
    functions: { invoke: (...a: unknown[]) => { m.calls.push('invoke'); return m.invoke(...a) } },
    auth: { signOut: (...a: unknown[]) => { m.calls.push('signOut'); return m.signOut(...a) } },
  },
}))

import DeleteAccountScreen from './DeleteAccountScreen'
import ExportScreen from './ExportScreen'
import PrivacyScreen from './PrivacyScreen'

const ui = (el: React.ReactElement) => render(<MemoryRouter>{el}</MemoryRouter>)

beforeAll(() => {
  window.matchMedia = window.matchMedia || ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false, onchange: null }) as MediaQueryList)
  globalThis.ResizeObserver = globalThis.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} }
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {})
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {})
})
beforeEach(() => {
  vi.clearAllMocks()
  m.tables = {
    accounts: [{ id: 'a1', name: 'Cash' }], categories: [{ id: 'c1', name: 'Food' }],
    transactions: [{ id: 't1', kind: 'expense', amount_paise: 25_000, for_other_paise: 0, date: '2026-11-05', account_id: 'a1', to_account_id: null, category_id: 'c1', title: 'Lunch', place: null, notes: null, tags: [] }],
  }
  m.tableError = null; m.saved = []; m.saveResult = 'downloaded'; m.calls = []
  m.invoke.mockResolvedValue({ data: { deleted: true }, error: null })
  m.signOut.mockResolvedValue({ error: null })
  m.disablePush.mockResolvedValue(undefined)
  useToasts.setState({ toasts: [] })
})

describe('Export', () => {
  it('exports everything as JSON (all tables, profile without its id) and confirms', async () => {
    const user = userEvent.setup()
    ui(<ExportScreen />)
    await user.click(screen.getByRole('button', { name: 'Export everything' }))
    await waitFor(() => expect(m.saved).toHaveLength(1))
    const f = m.saved[0]!
    expect(f).toMatchObject({ name: 'money-manager-2026-11-05.json', mime: 'application/json' })
    const doc = JSON.parse(f.content)
    expect(doc.counts).toMatchObject({ accounts: 1, transactions: 1, notes: 0 })
    expect(doc.profile).toEqual({ name: 'Sarang', timezone: 'Asia/Kolkata' })
    expect(doc.tables.transactions[0].title).toBe('Lunch')
    await waitFor(() => expect(useToasts.getState().toasts[0]?.message).toBe('Export downloaded'))
    expect(screen.getByRole('button', { name: 'Export everything' })).toBeEnabled()
  })

  it('exports transactions as CSV with names', async () => {
    const user = userEvent.setup()
    ui(<ExportScreen />)
    await user.click(screen.getByRole('button', { name: 'Export transactions' }))
    await waitFor(() => expect(m.saved).toHaveLength(1))
    expect(m.saved[0]).toMatchObject({ name: 'money-manager-2026-11-05.csv', mime: 'text/csv' })
    expect(m.saved[0]!.content).toContain('2026-11-05,Spent,250.00,Cash,,Food,Lunch')
  })

  it('a cancelled share shows no confirmation; a read error shows an alert and saves nothing', async () => {
    const user = userEvent.setup()
    m.saveResult = 'cancelled'
    ui(<ExportScreen />)
    await user.click(screen.getByRole('button', { name: 'Export transactions' }))
    await waitFor(() => expect(m.saved).toHaveLength(1))
    expect(useToasts.getState().toasts).toHaveLength(0)
    m.saved = []; m.tableError = 'permission denied'
    await user.click(screen.getByRole('button', { name: 'Export transactions' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('permission denied')
    expect(m.saved).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Export transactions' })).toBeEnabled()
  })
})

describe('Privacy', () => {
  it('Privacy explains storage and links to export and delete', () => {
    ui(<PrivacyScreen />)
    expect(screen.getByText(/No analytics/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Export' })).toHaveAttribute('href', '/settings/export')
    expect(screen.getByRole('link', { name: 'delete your account' })).toHaveAttribute('href', '/settings/delete')
  })
})

describe('Delete account', () => {
  const start = async (typed = 'sarang@example.com') => {
    const user = userEvent.setup()
    ui(<DeleteAccountScreen />)
    await user.type(screen.getByLabelText(/Type .* to confirm/), typed)
    return user
  }

  it('stays disabled until the email matches (case-insensitive)', async () => {
    const user = userEvent.setup()
    ui(<DeleteAccountScreen />)
    const btn = screen.getByRole('button', { name: 'Delete my account' })
    expect(btn).toBeDisabled()
    await user.type(screen.getByLabelText(/Type .* to confirm/), 'sarang@exampl')
    expect(btn).toBeDisabled()
    await user.type(screen.getByLabelText(/Type .* to confirm/), 'e.com')
    expect(btn).toBeEnabled()
  })

  it('asks once more, then deletes on the server before turning push off and signing out locally', async () => {
    const user = await start()
    await user.click(screen.getByRole('button', { name: 'Delete my account' }))
    expect(m.invoke).not.toHaveBeenCalled()
    await user.click(await screen.findByRole('button', { name: 'Delete forever' }))
    await waitFor(() => expect(m.signOut).toHaveBeenCalledWith({ scope: 'local' }))
    expect(m.invoke).toHaveBeenCalledWith('delete-account')
    expect(m.calls).toEqual(['invoke', 'push', 'signOut'])
  })

  it('a failed deletion shows an error and clears nothing', async () => {
    m.invoke.mockResolvedValue({ data: null, error: new Error('500') })
    const user = await start()
    await user.click(screen.getByRole('button', { name: 'Delete my account' }))
    await user.click(await screen.findByRole('button', { name: 'Delete forever' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Nothing was removed')
    expect(m.signOut).not.toHaveBeenCalled()
    expect(m.disablePush).not.toHaveBeenCalled()
  })

  it('cancelling the confirmation does nothing', async () => {
    const user = await start()
    await user.click(screen.getByRole('button', { name: 'Delete my account' }))
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(m.invoke).not.toHaveBeenCalled()
  })
})
