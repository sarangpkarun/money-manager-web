import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActivityRow } from '@/lib/db'
import { useUi } from '@/lib/uiStore'
import { Toaster } from '@/ui/Toaster'
import { useToasts } from '@/ui/toastStore'

const m = vi.hoisted(() => ({
  rows: [] as unknown[], pending: false, filtersSeen: [] as unknown[], del: vi.fn(), restore: vi.fn(), fetchNext: vi.fn(),
  summary: { spent: 0, received: 0, net: 0, by_account: [] as unknown[] },
}))

vi.mock('./queries', () => ({
  useActivity: (f: unknown) => {
    m.filtersSeen.push(f)
    return { data: { pages: [m.rows] }, isPending: m.pending, isError: false, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: m.fetchNext, refetch: vi.fn() }
  },
  useActivitySummary: () => ({ data: m.summary }),
  useDeleteTransaction: () => ({ mutateAsync: m.del }),
  useRestoreTransaction: () => ({ mutate: m.restore }),
}))
vi.mock('@/features/accounts/queries', () => ({
  useAccounts: () => ({ data: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Cash', archived: false }, { id: '22222222-2222-4222-8222-222222222222', name: 'Bank', archived: false }] }),
}))
vi.mock('@/features/categories/queries', () => ({ useCategories: () => ({ data: [{ id: 'c1', name: 'Food', kind: 'expense', icon: null, archived: false }] }) }))
vi.mock('@/features/profile/useToday', () => ({ useToday: () => '2026-11-05', useWeekStart: () => 1 }))

import ActivityScreen from './ActivityScreen'

const CASH = '11111111-1111-4111-8111-111111111111'
const BANK = '22222222-2222-4222-8222-222222222222'

const row = (o: Partial<ActivityRow>): ActivityRow => ({
  id: 'x', kind: 'expense', amount_paise: 10_000, date: '2026-11-05', account_id: 'cash', account_name: 'Cash', to_account_id: null, to_account_name: null,
  category_id: 'food', category_name: 'Food', category_icon: null, category_color: null, title: 'Lunch', place: null, notes: null, tags: [],
  for_other_paise: 0, entry_id: null, created_at: '2026-11-05T10:00:00Z', ...o,
})

beforeAll(() => {
  // jsdom has no layout: give elements a size so the virtualiser renders rows
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 700 })
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 400 })
  globalThis.ResizeObserver = globalThis.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} }
  window.matchMedia = window.matchMedia || ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false, onchange: null }) as MediaQueryList)
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {})
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {})
})

beforeEach(() => {
  vi.clearAllMocks()
  m.rows = [
    row({ id: '1', title: 'Lunch', amount_paise: 25_000, place: 'Cafe Blue' }),
    row({ id: '2', kind: 'income', title: 'Bonus', amount_paise: 500_000, category_name: 'Salary', date: '2026-11-05' }),
    row({ id: '3', title: 'Taxi', amount_paise: 90_000, date: '2026-11-04', category_name: 'Travel' }),
    row({ id: '4', kind: 'transfer', title: null, amount_paise: 100_000, date: '2026-11-04', account_name: 'Bank', to_account_id: 'cash', to_account_name: 'Cash', category_name: null }),
  ]
  m.pending = false
  m.filtersSeen = []
  m.del.mockImplementation(async (id: string) => ({ id, kind: 'expense', amount_paise: 25_000 }))
  m.summary = { spent: 115_000, received: 500_000, net: 385_000, by_account: [
    { account_id: CASH, name: 'Cash', spent: 25_000, received: 0 }, { account_id: BANK, name: 'Bank', spent: 90_000, received: 500_000 },
  ] }
  useToasts.setState({ toasts: [] })
  useUi.setState({ month: '2026-11', quickAddOpen: false, quickAddPrefill: null, activitySearch: '' })
})

function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}{l.search}</div> }
const ui = (path = '/activity') => render(<MemoryRouter initialEntries={[path]}><Where /><ActivityScreen /><Toaster /></MemoryRouter>)
const lastFilters = () => m.filtersSeen[m.filtersSeen.length - 1] as Record<string, unknown>

describe('Activity list', () => {
  it('shows day headers with totals, rows and signed amounts', () => {
    ui()
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('Yesterday')).toBeInTheDocument()
    const lunch = screen.getByRole('button', { name: 'Lunch, open details' })
    expect(lunch).toHaveTextContent('−₹250')
    expect(lunch).toHaveTextContent('Cafe Blue · Cash')
    expect(screen.getByRole('button', { name: 'Bonus, open details' })).toHaveTextContent('+₹5,000')
    expect(screen.getByRole('button', { name: 'Bank → Cash, open details' })).toHaveTextContent('₹1,000') // transfer: no sign
    expect(screen.getByText('₹250 spent')).toBeInTheDocument()
  })

  it('shows the month totals and queries the selected month', () => {
    ui()
    const totals = screen.getByLabelText('Totals')
    expect(totals).toHaveTextContent('₹1,150')
    expect(totals).toHaveTextContent('₹5,000')
    expect(totals).toHaveTextContent('₹3,850')
    expect(lastFilters()).toMatchObject({ from: '2026-11-01', to: '2026-11-30' })
    expect(screen.getByText('November 2026')).toBeInTheDocument()
  })

  it('month switcher moves the month and the query', async () => {
    const user = userEvent.setup()
    ui()
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(useUi.getState().month).toBe('2026-10')
    expect(lastFilters()).toMatchObject({ from: '2026-10-01', to: '2026-10-31' })
  })

  it('account chips filter via the URL', async () => {
    const user = userEvent.setup()
    ui()
    await user.click(within(screen.getByRole('group', { name: 'Filter by account' })).getByRole('button', { name: /Bank/ }))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`/activity?acc=${BANK}`))
    expect(lastFilters()).toMatchObject({ accounts: [BANK] })
  })

  it('search is debounced into the URL filters', async () => {
    const user = userEvent.setup()
    ui()
    await user.type(screen.getByLabelText('Search transactions'), 'taxi')
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('q=taxi'), { timeout: 2000 })
    expect(lastFilters()).toMatchObject({ q: 'taxi' })
  })

  it('reads filters from the URL', () => {
    ui('/activity?d=today&type=spend&q=lunch')
    expect(lastFilters()).toMatchObject({ from: '2026-11-05', to: '2026-11-05', kinds: ['expense'], q: 'lunch' })
    expect(screen.getByLabelText('Search transactions')).toHaveValue('lunch')
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled() // a preset overrides the month
  })
})

describe('filter sheet', () => {
  it('opens from the filter button, applies into the URL and shows the active count', async () => {
    const user = userEvent.setup()
    ui()
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Filters' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Spent' }))
    await user.click(within(dialog).getByRole('button', { name: 'Today' }))
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/activity?d=today&type=spend'))
    expect(screen.getByRole('button', { name: 'Filters, 2 active' })).toBeInTheDocument()
    expect(lastFilters()).toMatchObject({ kinds: ['expense'], from: '2026-11-05', to: '2026-11-05' })
  })
  it('shows the badge for filters already in the URL', () => {
    ui('/activity?type=transfer,spend&min=100')
    expect(screen.getByRole('button', { name: 'Filters, 2 active' })).toBeInTheDocument()
  })
})

describe('states', () => {
  it('skeleton while loading', () => {
    m.pending = true
    ui()
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull()
  })
  it('empty month offers to add the first expense', async () => {
    m.rows = []
    ui()
    await userEvent.click(screen.getByRole('button', { name: 'Add your first expense' }))
    expect(useUi.getState().quickAddOpen).toBe(true)
  })
  it('empty with filters says no matches and can clear them', async () => {
    m.rows = []
    ui('/activity?type=transfer')
    expect(screen.getByText('No matches')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/activity$/))
  })
})

describe('row actions', () => {
  it('tapping a row opens the detail sheet with the full details', async () => {
    const user = userEvent.setup()
    ui()
    await user.click(screen.getByRole('button', { name: 'Lunch, open details' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Cafe Blue')).toBeInTheDocument()
    expect(within(dialog).getByText('Food')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })

  it('Delete removes the row, shows Undo, and Undo restores the original', async () => {
    const user = userEvent.setup()
    ui()
    await user.click(screen.getByRole('button', { name: 'Lunch, open details' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(m.del).toHaveBeenCalledWith('1'))
    const toast = await screen.findByRole('status')
    expect(toast).toHaveTextContent('Deleted ₹250 · Lunch')
    await user.click(within(toast).getByRole('button', { name: 'Undo' }))
    expect(m.restore).toHaveBeenCalledWith({ id: '1', kind: 'expense', amount_paise: 25_000 })
  })

  it('a failed delete tells you why', async () => {
    m.del.mockRejectedValueOnce(new Error('offline'))
    const user = userEvent.setup()
    ui()
    await user.click(screen.getByRole('button', { name: 'Taxi, open details' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(useToasts.getState().toasts[0]?.message).toContain("Couldn't delete: offline"))
  })

  it('Edit opens Quick Add on that transaction', async () => {
    const user = userEvent.setup()
    ui()
    await user.click(screen.getByRole('button', { name: 'Lunch, open details' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Edit' }))
    const s = useUi.getState()
    expect(s.quickAddOpen).toBe(true)
    expect(s.quickAddPrefill?.edit?.id).toBe('1')
  })

  it('a transfer detail shows From and To', async () => {
    const user = userEvent.setup()
    ui()
    await user.click(screen.getByRole('button', { name: 'Bank → Cash, open details' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('From')).toBeInTheDocument()
    expect(within(dialog).getByText('To')).toBeInTheDocument()
  })
})

describe('restores filters when the tab is revisited', () => {
  it('uses the remembered query while another tab is active', () => {
    useUi.setState({ activitySearch: '?type=received' })
    act(() => undefined)
    ui('/calendar')
    expect(lastFilters()).toMatchObject({ kinds: ['income'] })
  })
})
