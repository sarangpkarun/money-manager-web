import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUi } from '@/lib/uiStore'
import type { Dashboard } from './dashboardTypes'

const CASH = '11111111-1111-4111-8111-111111111111'
const CARD = '33333333-3333-4333-8333-333333333333'
const FOOD = '44444444-4444-4444-8444-444444444444'

const m = vi.hoisted(() => ({
  data: undefined as unknown, isError: false, refetch: vi.fn(), args: [] as unknown[][], layout: null as unknown,
}))

vi.mock('./queries', () => ({
  useDashboard: (...a: unknown[]) => { m.args.push(a); return { data: m.data, isError: m.isError, refetch: m.refetch } },
}))
vi.mock('@/features/profile/useProfile', () => ({ useProfile: () => ({ data: { name: 'Sarang', dashboard_layout: m.layout } }) }))
vi.mock('@/features/profile/useToday', () => ({ useToday: () => '2026-11-10', useWeekStart: () => 1 }))
vi.mock('@/features/accounts/queries', () => ({ useAccounts: () => ({ data: [{ id: CASH, name: 'Cash', archived: false }] }) }))
vi.mock('@/features/categories/queries', () => ({ useCategories: () => ({ data: [] }) }))
const rec = vi.hoisted(() => ({ record: vi.fn() }))
vi.mock('@/features/money/queries', () => ({ useRecordPayment: () => ({ mutateAsync: rec.record, isPending: false }) }))

import HomeScreen from './HomeScreen'

const dash = (o: Partial<Dashboard> = {}): Dashboard => ({
  month: { month: '2026-11', start: '2026-11-01', end: '2026-11-30', spent: 45_000, received: 900_000, saved: 855_000, prev_spent: 30_000, prev_received: 0,
    days_in_month: 30, days_elapsed: 10, avg_daily_spent: 4_500, projected_spent: 135_000, count: 4 },
  daily: Array.from({ length: 30 }, (_, i) => ({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, spent: i === 0 ? 20_000 : 0, received: 0 })),
  by_category: [{ id: FOOD, name: 'Food', spent: 30_000, count: 2, icon: null, color: null }, { id: null, name: 'Uncategorised', spent: 15_000, count: 1 }],
  by_account: [{ id: CASH, name: 'Cash', spent: 45_000, count: 3 }],
  by_place: [{ id: null, name: 'Cafe', spent: 30_000, count: 2 }, { id: null, name: 'No place', spent: 15_000, count: 1 }],
  recent: [{ id: 'r1', kind: 'expense', amount_paise: 25_000, date: '2026-11-05', account_id: CASH, account_name: 'Cash', to_account_id: null, to_account_name: null,
    category_id: FOOD, category_name: 'Food', category_icon: null, category_color: null, title: 'Lunch', place: null, notes: null, tags: [], for_other_paise: 0, entry_id: null, created_at: '2026-11-05T10:00:00Z' }],
  accounts: [
    { id: CASH, name: 'Cash', type: 'cash', balance_paise: 100_000, outstanding_paise: null, credit_limit_paise: null, statement_day: null, due_day: null },
    { id: CARD, name: 'HDFC Card', type: 'credit_card', balance_paise: -200_000, outstanding_paise: 200_000, credit_limit_paise: 1_000_000, statement_day: 5, due_day: 22 },
  ],
  generated_at: '2026-11-10T00:00:00Z',
  ...o,
})

function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}{l.search}</div> }
const ui = () => render(<MemoryRouter initialEntries={['/']}><Where /><HomeScreen /></MemoryRouter>)

beforeAll(() => {
  window.matchMedia = window.matchMedia || ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false, onchange: null }) as MediaQueryList)
  globalThis.ResizeObserver = globalThis.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} }
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {})
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {})
})

beforeEach(() => {
  vi.clearAllMocks()
  m.data = dash(); m.isError = false; m.args = []; m.layout = null
  localStorage.clear()
  useUi.setState({ month: '2026-11', homeSearch: '', activitySearch: '' })
})

describe('Home dashboard', () => {
  it('asks for the selected month, the client "today" and no date filters', () => {
    ui()
    expect(m.args[0]).toEqual(['2026-11', '2026-11-10', {}])
  })

  it('This month shows spent, projection, comparison, received and saved', () => {
    ui()
    const card = screen.getByRole('region', { name: 'This month' })
    expect(within(card).getByLabelText('Spent ₹450')).toBeInTheDocument()
    expect(card).toHaveTextContent('on pace for ₹1,350')
    expect(card).toHaveTextContent('▲ 50% (₹150) more than last month')
    expect(card).toHaveTextContent('₹9,000')
    expect(card).toHaveTextContent('₹8,550')
  })

  it('omits the projection when the server sends none', () => {
    m.data = dash({ month: { ...dash().month, projected_spent: null } })
    ui()
    expect(screen.getByRole('region', { name: 'This month' })).not.toHaveTextContent('on pace')
  })

  it('Where it went toggles category / account / place and remembers the choice', async () => {
    const user = userEvent.setup()
    ui()
    const card = screen.getByRole('region', { name: 'Where it went' })
    expect(within(card).getByText('Food')).toBeInTheDocument()
    expect(within(card).getByText('67%')).toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: 'Place' }))
    expect(within(card).getByText('Cafe')).toBeInTheDocument()
    expect(localStorage.getItem('mm-home-by')).toBe('place')
  })

  it('drills a category into Activity with the same month filters', async () => {
    const user = userEvent.setup()
    ui()
    await user.click(screen.getByRole('button', { name: /^Food, ₹300/ }))
    expect(screen.getByTestId('where')).toHaveTextContent(`/activity?cat=${FOOD}`)
    expect(useUi.getState().activitySearch).toBe(`?cat=${FOOD}`)
  })

  it('does not make uncategorised or "No place" rows tappable', async () => {
    const user = userEvent.setup()
    ui()
    expect(screen.queryByRole('button', { name: /Uncategorised/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Place' }))
    expect(screen.queryByRole('button', { name: /No place/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: /^Cafe, ₹300/ }))
    expect(screen.getByTestId('where')).toHaveTextContent('/activity?place=Cafe')
  })

  it('Cards card shows outstanding and utilisation and drills to that card', async () => {
    const user = userEvent.setup()
    ui()
    const card = screen.getByRole('region', { name: 'Credit cards' })
    expect(card).toHaveTextContent('₹2,000')
    expect(card).toHaveTextContent('20% of ₹10,000')
    expect(card).toHaveTextContent('Due on the 22nd')
    expect(within(card).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '20')
    await user.click(within(card).getByRole('button'))
    expect(screen.getByTestId('where')).toHaveTextContent(`/activity?acc=${CARD}`)
  })

  it('hides the Cards card when there is no credit card', () => {
    m.data = dash({ accounts: dash().accounts.filter((a) => a.type !== 'credit_card') })
    ui()
    expect(screen.queryByRole('region', { name: 'Credit cards' })).toBeNull()
  })

  it('Recent activity lists rows and See all opens Activity', async () => {
    const user = userEvent.setup()
    ui()
    const card = screen.getByRole('region', { name: 'Recent activity' })
    expect(within(card).getByRole('button', { name: 'Lunch, open details' })).toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: 'See all' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/activity')
  })

  it('month switcher changes the month used for the query', async () => {
    const user = userEvent.setup()
    ui()
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(useUi.getState().month).toBe('2026-10')
    expect(m.args[m.args.length - 1]?.[0]).toBe('2026-10')
  })

  it('shows a skeleton while loading, and an error card with Retry', async () => {
    const user = userEvent.setup()
    m.data = undefined
    const view = ui()
    expect(screen.getByLabelText('Loading dashboard')).toBeInTheDocument()
    view.unmount()
    m.isError = true
    ui()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(m.refetch).toHaveBeenCalled()
  })

  it('shows the empty state with an Add expense button for an empty month', async () => {
    const user = userEvent.setup()
    m.data = dash({ month: { ...dash().month, spent: 0, received: 0, saved: 0, count: 0, projected_spent: null }, recent: [] })
    ui()
    expect(screen.getByText('Nothing in November 2026')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add expense' }))
    expect(useUi.getState().quickAddOpen).toBe(true)
  })

  it('applies profiles.dashboard_layout: hide and reorder cards', () => {
    m.layout = { order: ['recent', 'this_month'], hidden: ['where_it_went'] }
    ui()
    const names = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))
    expect(names).toEqual(['Recent activity', 'This month', 'Credit cards'])
  })

  it('the avatar links to Settings', () => {
    ui()
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
  })

  const ageing = { current: 50_000, d1_30: 20_000, d31_60: 0, d61_plus: 30_000 }
  const withMoney = () => dash({
    people: { owed_to_me: 100_000, overdue_owed_to_me: 50_000, ageing_owed_to_me: ageing, i_owe: 40_000, overdue_i_owe: 0, ageing_i_owe: { current: 40_000, d1_30: 0, d31_60: 0, d61_plus: 0 }, open_count: 3 },
    net_position: { assets: 500_000, card_outstanding: 200_000, owed_to_me: 100_000, i_owe: 40_000 },
  })

  it('Net position adds accounts and money owed, and subtracts what you owe and card bills', async () => {
    const user = userEvent.setup()
    m.data = withMoney()
    ui()
    const card = screen.getByRole('region', { name: 'Net position' })
    expect(card).toHaveTextContent('₹3,600') // 5,000 + 1,000 - 400 - 2,000
    expect(card).toHaveTextContent('In your accounts')
    expect(card).toHaveTextContent('Card bills')
    await user.click(within(card).getByRole('button', { name: 'Money' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/money')
  })

  it('Money with people shows totals, overdue and ageing buckets for each side', () => {
    m.data = withMoney()
    ui()
    const card = screen.getByRole('region', { name: 'Money with people' })
    const owed = within(card).getByRole('group', { name: 'They owe me' })
    expect(owed).toHaveTextContent('₹1,000')
    expect(owed).toHaveTextContent('₹500 overdue')
    expect(owed).toHaveTextContent('Not due₹500')
    expect(owed).toHaveTextContent('1–30 days late₹200')
    expect(owed).toHaveTextContent('61+ days late₹300')
    expect(owed).not.toHaveTextContent('31–60')
    expect(within(card).getByRole('group', { name: 'I owe' })).toHaveTextContent('₹400')
  })

  it('both cards stay out of the way for results without lending data or with nothing open', () => {
    ui()
    expect(screen.queryByRole('region', { name: 'Net position' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Money with people' })).toBeNull()
    m.data = { ...withMoney(), people: { ...withMoney().people!, open_count: 0 } }
    ui()
    expect(screen.queryByRole('region', { name: 'Money with people' })).toBeNull()
  })

  const withPlans = () => dash({
    due_soon: { total_count: 7, items: [
      { entry_id: 'e1', seq: 2, kind: 'borrowed', direction: 'pay', title: 'From Ravi', name: 'Ravi', due_date: '2026-11-08', remaining_paise: 500_000 },
      { entry_id: 'e2', seq: 1, kind: 'lent', direction: 'receive', title: 'Lent to Meera', name: 'Meera', due_date: '2026-11-12', remaining_paise: 120_000 },
    ] },
    emi_load: { months: Array.from({ length: 12 }, (_, i) => ({ month: `2026-${String(i + 11 > 12 ? i - 1 : i + 11).padStart(2, '0')}`, due_paise: i < 3 ? 500_000 : 0 })), overdue_paise: 200_000, outstanding_paise: 1_500_000, debt_free_date: '2027-01-10', open_count: 2 },
  })

  it('Due soon lists overdue and upcoming rows with a Pay / Receive button and an overflow count', () => {
    m.data = withPlans()
    ui()
    const card = screen.getByRole('region', { name: 'Due soon' })
    expect(card).toHaveTextContent('From Ravi')
    expect(card).toHaveTextContent('2 days overdue')
    expect(card).toHaveTextContent('Due in 2 days')
    expect(card).toHaveTextContent('+5 more due soon')
    expect(within(card).getByRole('button', { name: 'Pay From Ravi' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Receive Lent to Meera' })).toBeInTheDocument()
  })

  it('Pay opens the payment sheet for exactly that row; the card opens the entry', async () => {
    const user = userEvent.setup()
    m.data = withPlans()
    ui()
    await user.click(screen.getByRole('button', { name: 'Pay From Ravi' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Amount')).toHaveValue('5000')
    await user.click(within(dialog).getByRole('button', { name: 'Pay' }))
    expect(rec.record.mock.calls[0]?.[0]).toMatchObject({ entry_id: 'e1', amount_paise: 500_000, target_seq: 2 })
  })

  it('tapping a due item opens its entry', async () => {
    const user = userEvent.setup()
    m.data = withPlans()
    ui()
    await user.click(screen.getByRole('button', { name: 'From Ravi, Ravi, open details' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/money/entry/e1')
  })

  it('EMI & loan load shows what is left, overdue, 12 monthly bars and the debt-free date', () => {
    m.data = withPlans()
    ui()
    const card = screen.getByRole('region', { name: 'EMI & loan load' })
    expect(card).toHaveTextContent('₹15,000')
    expect(card).toHaveTextContent('₹2,000 overdue from earlier months')
    expect(within(card).getAllByRole('listitem')).toHaveLength(12)
    expect(card).toHaveTextContent('Debt-free by Jan 2027 (2 months)')
  })

  it('neither plan card appears without data or with nothing owed', () => {
    ui()
    expect(screen.queryByRole('region', { name: 'Due soon' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'EMI & loan load' })).toBeNull()
    m.data = dash({ due_soon: { items: [], total_count: 0 }, emi_load: { months: [], overdue_paise: 0, outstanding_paise: 0, debt_free_date: null, open_count: 0 } })
    ui()
    expect(screen.queryByRole('region', { name: 'Due soon' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'EMI & loan load' })).toBeNull()
  })
})

