import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUi } from '@/lib/uiStore'
import type { HistoryRow, MoneyOverview, OverviewEntry, PersonBalance } from './types'

const m = vi.hoisted(() => ({ overview: undefined as unknown, isError: false, refetch: vi.fn(), history: [] as unknown[], people: [] as unknown[] }))

vi.mock('./queries', () => ({
  useMoneyOverview: () => ({ data: m.overview, isError: m.isError, refetch: m.refetch }),
  useMoneyHistory: () => ({ data: { pages: [m.history] }, isPending: false, isError: false, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn() }),
  usePeopleBalances: () => ({ data: m.people, isPending: false, isError: false, refetch: vi.fn() }),
  usePeople: () => ({ data: [] }),
  useSavePerson: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useMergePeople: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useImportPeople: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/profile/useToday', () => ({ useToday: () => '2026-11-15', useWeekStart: () => 1 }))

import MoneyScreen from './MoneyScreen'

const entry = (o: Partial<OverviewEntry>): OverviewEntry => ({
  id: 'e1', kind: 'lent', direction: 'receive', title: 'Loan to Ravi', person_id: 'p1', person_name: 'Ravi', principal_paise: 1_000_000, total_paise: 1_000_000,
  paid_paise: 0, outstanding_paise: 1_000_000, start_date: '2026-11-01', due_date: '2026-12-01', overdue_paise: 0, rows_total: 1, rows_paid: 0, ...o,
})
const ageing = { current: 0, d1_30: 0, d31_60: 0, d61_plus: 0 }
const overview = (entries: OverviewEntry[], stats: Partial<MoneyOverview['stats']> = {}): MoneyOverview => ({
  entries, stats: { owed_to_me: 0, overdue_owed_to_me: 0, ageing_owed_to_me: ageing, i_owe: 0, overdue_i_owe: 0, ageing_i_owe: ageing, open_count: entries.length, ...stats },
})
const person = (o: Partial<PersonBalance>): PersonBalance => ({
  person_id: 'p1', name: 'Ravi', phone: null, email: null, archived: false, owed_to_me_paise: 0, i_owe_paise: 0, open_count: 0, entry_count: 0, last_entry_date: null, ...o,
})

beforeAll(() => {
  window.matchMedia = window.matchMedia || ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false, onchange: null }) as MediaQueryList)
  globalThis.ResizeObserver = globalThis.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} }
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {})
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {})
})

beforeEach(() => {
  vi.clearAllMocks()
  m.isError = false
  m.history = []
  m.people = []
  m.overview = overview([
    entry({ id: 'e1', outstanding_paise: 600_000, paid_paise: 400_000, due_date: '2026-11-01' }), // partly paid and overdue
    entry({ id: 'e2', title: 'Phone loan', person_id: 'p2', person_name: 'Meera', outstanding_paise: 250_000, total_paise: 250_000, due_date: null }),
    entry({ id: 'e3', direction: 'pay', kind: 'borrowed', title: 'Rent help', person_id: 'p3', person_name: 'Chitra', outstanding_paise: 90_000, total_paise: 90_000, due_date: '2026-11-20' }),
  ], { owed_to_me: 850_000, overdue_owed_to_me: 600_000, i_owe: 90_000 })
  useUi.setState({ quickAddOpen: false, quickAddPrefill: null })
})

function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}</div> }
const ui = () => render(<MemoryRouter initialEntries={['/money']}><Where /><MoneyScreen /></MemoryRouter>)

describe('Money tab', () => {
  it('summary shows what they owe me and what I owe, with overdue', () => {
    ui()
    const s = screen.getByRole('region', { name: 'Summary' })
    expect(s).toHaveTextContent('They owe me')
    expect(s).toHaveTextContent('₹8,500')
    expect(s).toHaveTextContent('₹6,000') // overdue
    expect(s).toHaveTextContent('₹900')
  })

  it('Owed to me groups entries by person with status, due text and progress', () => {
    ui()
    const ravi = screen.getByRole('region', { name: 'Ravi' })
    expect(within(ravi).getByText('Overdue')).toBeInTheDocument()
    expect(within(ravi).getByText('14 days overdue')).toBeInTheDocument()
    expect(within(ravi).getByText('40% paid')).toBeInTheDocument()
    const meera = screen.getByRole('region', { name: 'Meera' })
    expect(within(meera).getByText('Pending')).toBeInTheDocument()
    expect(within(meera).getByText('No due date')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Chitra' })).toBeNull() // that one is on the I owe tab
  })

  it('I owe shows borrowed entries', async () => {
    const user = userEvent.setup()
    ui()
    await user.click(screen.getByRole('tab', { name: 'I owe' }))
    expect(screen.getByRole('region', { name: 'Chitra' })).toHaveTextContent('Rent help')
    expect(screen.queryByRole('region', { name: 'Ravi' })).toBeNull()
  })

  it('tapping an entry opens its detail', async () => {
    const user = userEvent.setup()
    ui()
    await user.click(screen.getByRole('button', { name: /^Phone loan, Meera, pending/ }))
    expect(screen.getByTestId('where')).toHaveTextContent('/money/entry/e2')
  })

  it('empty states offer to lend or borrow', async () => {
    const user = userEvent.setup()
    m.overview = overview([])
    ui()
    await user.click(screen.getByRole('button', { name: 'Lend money' }))
    expect(useUi.getState()).toMatchObject({ quickAddOpen: true, quickAddPrefill: { kind: 'lent' } })
    act(() => useUi.getState().setQuickAddOpen(false))
    await user.click(screen.getByRole('tab', { name: 'I owe' }))
    await user.click(screen.getByRole('button', { name: 'Add borrowed money' }))
    expect(useUi.getState().quickAddPrefill).toMatchObject({ kind: 'borrowed' })
  })

  it('History lists settled entries', async () => {
    const user = userEvent.setup()
    const h: HistoryRow = { id: 'h1', kind: 'lent', direction: 'receive', title: 'Old loan', person_id: 'p1', person_name: 'Ravi', principal_paise: 500_000, total_paise: 500_000, paid_paise: 500_000, start_date: '2026-09-01', due_date: null, settled_on: '2026-11-14' }
    m.history = [h]
    ui()
    await user.click(screen.getByRole('tab', { name: 'History' }))
    const row = screen.getByRole('button', { name: 'Old loan, Ravi, settled, open details' })
    expect(row).toHaveTextContent('Paid')
    expect(row).toHaveTextContent('Yesterday')
    await user.click(row)
    expect(screen.getByTestId('where')).toHaveTextContent('/money/entry/h1')
  })

  it('shows a skeleton while loading and an error card with Retry', async () => {
    const user = userEvent.setup()
    m.overview = undefined
    const view = ui()
    expect(screen.getByLabelText('Loading money')).toBeInTheDocument()
    view.unmount()
    m.isError = true
    ui()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(m.refetch).toHaveBeenCalled()
  })

  it('People tab: net per person, filters and duplicate banner', async () => {
    const user = userEvent.setup()
    m.people = [
      person({ person_id: 'p1', name: 'Ravi', owed_to_me_paise: 600_000, open_count: 1, entry_count: 1 }),
      person({ person_id: 'p3', name: 'Chitra', i_owe_paise: 90_000, open_count: 1, entry_count: 1 }),
      person({ person_id: 'p4', name: 'Meera', entry_count: 2 }),
      person({ person_id: 'p5', name: 'meera ', entry_count: 0 }),
      person({ person_id: 'p6', name: 'Gone', archived: true }),
    ]
    ui()
    await user.click(screen.getByRole('tab', { name: 'People' }))
    const ravi = await screen.findByRole('button', { name: 'Ravi, open details' })
    expect(ravi).toHaveTextContent('owes you')
    expect(ravi).toHaveTextContent('₹6,000')
    expect(screen.getByRole('button', { name: 'Chitra, open details' })).toHaveTextContent('you owe')
    expect(screen.queryByRole('button', { name: 'Gone, open details' })).toBeNull()
    expect(screen.getByText('1 possible duplicate')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Owes me' }))
    expect(screen.queryByRole('button', { name: 'Chitra, open details' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Archived' }))
    expect(screen.getByRole('button', { name: 'Gone, open details' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'All' }))
    await user.type(screen.getByLabelText('Search people'), 'chit')
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Ravi, open details' })).toBeNull())
    expect(screen.getByRole('button', { name: 'Chitra, open details' })).toBeInTheDocument()
  })
})
