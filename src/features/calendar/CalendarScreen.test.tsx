import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUi } from '@/lib/uiStore'
import { useToasts } from '@/ui/toastStore'
import type { AgendaWindow, CalendarItem, CalendarMonth, CalendarNote } from './types'

const m = vi.hoisted(() => ({
  cal: undefined as unknown, isError: false, refetch: vi.fn(), args: [] as unknown[][],
  agenda: undefined as unknown, tick: vi.fn(), undo: vi.fn(), save: vi.fn(), del: vi.fn(), restore: vi.fn(), record: vi.fn(),
}))

vi.mock('./queries', () => ({
  useCalendarMonth: (...a: unknown[]) => { m.args.push(a); return { data: m.cal, isError: m.isError, refetch: m.refetch } },
  useAgenda: () => ({ data: m.agenda, isPending: false, isError: false, hasPreviousPage: false, hasNextPage: false, isFetchingNextPage: false, isFetchingPreviousPage: false, fetchNextPage: vi.fn(), fetchPreviousPage: vi.fn(), refetch: vi.fn() }),
  useTickTask: () => ({ mutateAsync: m.tick }),
  useUndoTick: () => ({ mutate: m.undo }),
  useSaveNote: () => ({ mutateAsync: m.save, isPending: false }),
  useDeleteNote: () => ({ mutateAsync: m.del }),
  useRestoreNote: () => ({ mutate: m.restore }),
}))
vi.mock('@/features/money/queries', () => ({ useRecordPayment: () => ({ mutateAsync: m.record, isPending: false }) }))
vi.mock('@/features/accounts/queries', () => ({ useAccounts: () => ({ data: [{ id: 'cash', name: 'Cash', archived: false }] }) }))
vi.mock('@/features/categories/queries', () => ({ useCategories: () => ({ data: [] }) }))
vi.mock('@/features/profile/useToday', () => ({ useToday: () => '2026-11-15', useWeekStart: () => 1 }))
vi.mock('@/features/profile/useProfile', () => ({ useProfile: () => ({ data: { timezone: 'Asia/Kolkata' } }) }))

import CalendarScreen from './CalendarScreen'

const item = (o: Partial<CalendarItem> = {}): CalendarItem => ({
  entry_id: 'e1', seq: 1, kind: 'borrowed', title: 'Loan', name: 'Ravi', direction: 'pay', due_date: '2026-11-03', due_paise: 100_000, paid_paise: 0, paid_on: null, remaining_paise: 100_000, ...o,
})
const note = (o: Partial<CalendarNote> = {}): CalendarNote => ({ id: 'n1', kind: 'task', title: 'Call bank', date: '2026-11-12', repeat_rule: null, done: false, body: null, entry_id: null, ...o })

const month = (o: Partial<CalendarMonth> = {}): CalendarMonth => ({
  month: '2026-11', start: '2026-11-01', end: '2026-11-30',
  totals: { spent: 45_000, received: 900_000, dues_paise: 250_000, overdue_paise: 100_000 },
  days: [{ date: '2026-11-01', spent: 45_000, received: 0, txn_count: 2 }, { date: '2026-11-18', spent: 0, received: 900_000, txn_count: 1 }],
  items: [
    item(), // overdue (3 Nov)
    item({ seq: 2, due_date: '2026-11-28', remaining_paise: 100_000 }), // upcoming
    item({ seq: 3, due_date: '2026-11-25', paid_paise: 100_000, paid_on: '2026-11-18', remaining_paise: 0 }), // paid early
    item({ seq: 4, due_date: '2026-11-05', paid_paise: 100_000, paid_on: '2026-11-07', remaining_paise: 0 }), // paid late
  ],
  txns: [
    { id: 't1', kind: 'expense', amount_paise: 30_000, date: '2026-11-01', account_id: 'cash', account_name: 'Cash', to_account_id: null, to_account_name: null, category_id: null, category_name: 'Food', category_icon: null, category_color: null, title: 'Lunch', place: null, notes: null, tags: [], for_other_paise: 0, entry_id: null, created_at: '2026-11-01T10:00:00Z' },
    { id: 't2', kind: 'expense', amount_paise: 15_000, date: '2026-11-01', account_id: 'cash', account_name: 'Cash', to_account_id: null, to_account_name: null, category_id: null, category_name: 'Food', category_icon: null, category_color: null, title: 'Tea', place: null, notes: null, tags: [], for_other_paise: 0, entry_id: null, created_at: '2026-11-01T11:00:00Z' },
  ],
  notes: [note(), note({ id: 'w', title: 'Water plants', kind: 'task', date: '2026-11-02', repeat_rule: 'weekly' })],
  ...o,
}) as CalendarMonth

beforeAll(() => {
  window.matchMedia = window.matchMedia || ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false, onchange: null }) as MediaQueryList)
  globalThis.ResizeObserver = globalThis.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} }
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {})
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {})
})

beforeEach(() => {
  vi.clearAllMocks()
  m.cal = month(); m.isError = false; m.args = []; m.agenda = undefined
  m.tick.mockResolvedValue({ undo: { id: 'w', patch: { date: '2026-11-02' } }, movedTo: '2026-11-09' })
  m.save.mockResolvedValue({}); m.del.mockResolvedValue({ id: 'n1', title: 'Call bank' }); m.record.mockResolvedValue({})
  localStorage.clear()
  useToasts.setState({ toasts: [] })
  useUi.setState({ month: '2026-11', calendarSearch: '', activitySearch: '', quickAddOpen: false, quickAddPrefill: null })
})

function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}{l.search}</div> }
const ui = () => render(<MemoryRouter initialEntries={['/calendar']}><Where /><CalendarScreen /></MemoryRouter>)
const cell = (name: RegExp) => screen.getByRole('button', { name })

describe('Calendar month grid', () => {
  it('asks for the selected month, the client "today" and no date filters', () => {
    ui()
    expect(m.args[0]).toEqual(['2026-11', '2026-11-15', {}])
  })

  it('shows the totals strip with the overdue amount', () => {
    ui()
    const t = screen.getByRole('region', { name: 'Month totals' })
    expect(t).toHaveTextContent('₹450')
    expect(t).toHaveTextContent('₹9,000')
    expect(t).toHaveTextContent('₹2,500')
    expect(t).toHaveTextContent('₹1,000 overdue')
  })

  it('markers: red overdue, amber upcoming, blue ✓ on BOTH dates when paid early, amber ✓ on both when paid late', () => {
    const { container } = ui()
    const has = (name: RegExp, kind: string) => expect(within(cell(name)).queryByText('✓') ?? cell(name).querySelector(`[data-marker="${kind}"]`)).not.toBeNull()
    expect(cell(/^3 Nov, 1 overdue/).querySelector('[data-marker="overdue"]')).not.toBeNull()
    expect(cell(/^28 Nov, 1 due/).querySelector('[data-marker="due"]')).not.toBeNull()
    for (const d of [/^25 Nov, 1 paid early/, /^18 Nov, 1 paid early/]) has(d, 'paid_early') // scenario B
    for (const d of [/^5 Nov, 1 paid late/, /^7 Nov, 1 paid late/]) has(d, 'paid_late') // scenario D
    expect(container.querySelectorAll('[data-marker="paid_early"]')).toHaveLength(2)
    expect(container.querySelectorAll('[data-marker="paid_late"]')).toHaveLength(2)
  })

  it('shows compact day spend and a note marker for each occurrence of a repeating task', () => {
    const { container } = ui()
    expect(cell(/^1 Nov, .*spent ₹450/)).toHaveTextContent('₹450')
    expect(container.querySelectorAll('[data-marker="task"]')).toHaveLength(5 + 1) // weekly from 2 Nov: 2, 9, 16, 23, 30 + the one-off on 12 Nov
  })

  it('today has a ring and is labelled', () => {
    ui()
    expect(cell(/^15 Nov, today/)).toHaveClass('ring-2')
  })

  it('layer chips switch markers and spend off (and remember the choice)', async () => {
    const user = userEvent.setup()
    const { container } = ui()
    await user.click(screen.getByRole('button', { name: 'Dues' }))
    expect(container.querySelectorAll('[data-marker="overdue"], [data-marker="due"], [data-marker="paid_early"], [data-marker="paid_late"]')).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Notes' }))
    expect(container.querySelectorAll('[data-marker]')).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Spending' }))
    expect(within(screen.getByRole('grid')).queryByText('₹450')).toBeNull()
    expect(JSON.parse(localStorage.getItem('mm-cal-layers')!)).toEqual({ dues: false, spending: false, notes: false })
  })

  it('month arrows change the shared month', async () => {
    const user = userEvent.setup()
    ui()
    await user.click(screen.getByRole('button', { name: 'Next month' }))
    expect(useUi.getState().month).toBe('2026-12')
    expect(m.args[m.args.length - 1]?.[0]).toBe('2026-12')
  })

  it('weeks start on Monday (profile setting) and the grid has the right rows', () => {
    ui()
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S'])
    expect(screen.getAllByRole('row')).toHaveLength(1 + 6) // header + the 6 weeks November 2026 spans
  })

  it('skeleton while loading, an error card with Retry', async () => {
    const user = userEvent.setup()
    m.cal = undefined
    const v = ui()
    expect(screen.getByLabelText('Loading calendar')).toBeInTheDocument()
    v.unmount()
    m.isError = true
    ui()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(m.refetch).toHaveBeenCalled()
  })

  it('the filter button shows a badge when filters are active', () => {
    useUi.setState({ calendarSearch: '?acc=11111111-1111-4111-8111-111111111111' })
    render(<MemoryRouter initialEntries={['/activity']}><CalendarScreen /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Filters, 1 active' })).toBeInTheDocument()
    expect(m.args[0]?.[2]).toEqual({ accounts: ['11111111-1111-4111-8111-111111111111'] })
  })
})

describe('Day sheet', () => {
  it('opens from the cached payload with Due, Spending and Notes for that day', async () => {
    const user = userEvent.setup()
    ui()
    await user.click(cell(/^3 Nov, 1 overdue/))
    const dialog = await screen.findByRole('dialog', { name: 'Tuesday, 3 Nov 2026' })
    expect(within(dialog).getByRole('region', { name: 'Due' })).toHaveTextContent('Loan')
    expect(within(dialog).getByRole('region', { name: 'Due' })).toHaveTextContent('Overdue (12 days late)')
    expect(within(dialog).queryByRole('region', { name: 'Paid' })).toBeNull()
    expect(m.args.length).toBeGreaterThan(0)
  })

  it('a day with spending lists the rows and opens Activity for that day', async () => {
    const user = userEvent.setup()
    ui()
    await user.click(cell(/^1 Nov, /))
    const dialog = await screen.findByRole('dialog')
    const s = within(dialog).getByRole('region', { name: 'Spending & income' })
    expect(s).toHaveTextContent('Lunch')
    expect(s).toHaveTextContent('Tea')
    await user.click(within(s).getByRole('button', { name: /^Lunch.*open details/ }))
    expect(screen.getByTestId('where')).toHaveTextContent('/activity?d=custom&from=2026-11-01&to=2026-11-01')
    expect(useUi.getState().activitySearch).toBe('?d=custom&from=2026-11-01&to=2026-11-01')
  })

  it('"See all in Activity" appears when the day has more rows than the payload carries', async () => {
    const user = userEvent.setup()
    m.cal = month({ days: [{ date: '2026-11-01', spent: 45_000, received: 0, txn_count: 40 }] })
    ui()
    await user.click(cell(/^1 Nov, /))
    expect(await screen.findByRole('button', { name: 'See all 40 in Activity' })).toBeInTheDocument()
  })

  it('Paid: on the paid day it says "was due"; on the due day it says when it was paid; both carry the early/late text', async () => {
    const user = userEvent.setup()
    ui()
    await user.click(cell(/^18 Nov, 1 paid early/))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('region', { name: 'Paid' })).toHaveTextContent('Paid early (7 days)')
    expect(within(dialog).getByRole('region', { name: 'Paid' })).toHaveTextContent('was due 25 Nov')
  })

  it('on the due day of an early-paid row it says it was paid on the other date', async () => {
    const user = userEvent.setup()
    ui()
    await user.click(cell(/^25 Nov, 1 paid early/))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('region', { name: 'Paid' })).toHaveTextContent('paid 18 Nov')
  })

  it('Pay from the day sheet records against that very row', async () => {
    const user = userEvent.setup()
    ui()
    await user.click(cell(/^3 Nov, 1 overdue/))
    await user.click(await screen.findByRole('button', { name: 'Pay Loan' }))
    const pay = await screen.findByRole('dialog')
    expect(within(pay).getByLabelText('Amount')).toHaveValue('1000')
    await user.click(within(pay).getByRole('button', { name: 'Pay' }))
    expect(m.record.mock.calls[0]?.[0]).toMatchObject({ entry_id: 'e1', amount_paise: 100_000, target_seq: 1 })
  })

  it('Add transaction closes the sheet and opens Quick Add with that date', async () => {
    const user = userEvent.setup()
    ui()
    await user.click(cell(/^20 Nov/))
    await user.click(await screen.findByRole('button', { name: 'Add transaction' }))
    expect(useUi.getState()).toMatchObject({ quickAddOpen: true, quickAddPrefill: { date: '2026-11-20' } })
    expect(screen.queryByRole('dialog', { name: /Friday, 20 Nov/ })).toBeNull()
  })

  it('an entry opens from the sheet', async () => {
    const user = userEvent.setup()
    ui()
    await user.click(cell(/^3 Nov, 1 overdue/))
    await user.click(await screen.findByRole('button', { name: /^Loan, instalment 1.*open details/ }))
    expect(screen.getByTestId('where')).toHaveTextContent('/money/entry/e1')
  })

  it('an empty day says so', async () => {
    const user = userEvent.setup()
    ui()
    await user.click(cell(/^20 Nov/))
    expect(await screen.findByText('Nothing on this day.')).toBeInTheDocument()
  })
})

describe('Notes and tasks', () => {
  it('Add note / task saves with the day pre-filled, then returns to the day sheet', async () => {
    const user = userEvent.setup()
    ui()
    await user.click(cell(/^20 Nov/))
    await user.click(await screen.findByRole('button', { name: 'Add note / task' }))
    const dlg = await screen.findByRole('dialog', { name: 'Add note or task' })
    expect(within(dlg).getByLabelText('Date')).toHaveValue('2026-11-20')
    await user.click(within(dlg).getByRole('button', { name: 'Save' }))
    expect(await within(dlg).findByText('Enter a title')).toBeInTheDocument()
    await user.type(within(dlg).getByLabelText('Title'), 'Pay rent')
    await user.click(within(dlg).getByRole('button', { name: 'Weekly' }))
    await user.click(within(dlg).getByRole('button', { name: 'Save' }))
    expect(m.save).toHaveBeenCalledWith({ id: undefined, values: { kind: 'task', title: 'Pay rent', body: null, date: '2026-11-20', repeat_rule: 'weekly', remind_at: null } })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add note or task' })).toBeNull())
    expect(await screen.findByRole('dialog', { name: 'Friday, 20 Nov 2026' })).toBeInTheDocument()
  })

  it('a custom repeat is stored as "every N units"; an invalid number is refused', async () => {
    const user = userEvent.setup()
    ui()
    await user.click(cell(/^20 Nov/))
    await user.click(await screen.findByRole('button', { name: 'Add note / task' }))
    const dlg = await screen.findByRole('dialog', { name: 'Add note or task' })
    await user.type(within(dlg).getByLabelText('Title'), 'Gym')
    await user.click(within(dlg).getByRole('button', { name: 'Custom' }))
    const n = within(dlg).getByLabelText('Repeat every')
    await user.clear(n)
    await user.type(n, '0')
    await user.click(within(dlg).getByRole('button', { name: 'Save' }))
    expect(await within(dlg).findByText('Enter a number from 1 to 999')).toBeInTheDocument()
    await user.clear(n)
    await user.type(n, '3')
    await user.selectOptions(within(dlg).getByLabelText('Repeat unit'), 'month')
    await user.click(within(dlg).getByRole('button', { name: 'Save' }))
    expect(m.save.mock.calls[0]?.[0].values.repeat_rule).toBe('every 3 months')
  })

  it('ticking a repeating task moves it to its next date; Undo puts it back', async () => {
    const user = userEvent.setup()
    ui()
    await user.click(cell(/^9 Nov/))
    await user.click(await screen.findByRole('checkbox', { name: 'Mark done: Water plants' }))
    expect(m.tick).toHaveBeenCalledWith({ id: 'w', date: '2026-11-02', repeat_rule: 'weekly', done: false, remind_at: null, timezone: 'Asia/Kolkata' })
    await waitFor(() => expect(useToasts.getState().toasts[0]?.message).toBe('"Water plants" done · next 9 Nov'))
    act(() => { useToasts.getState().toasts[0]?.actions[0]?.run() })
    expect(m.undo).toHaveBeenCalledWith({ id: 'w', patch: { date: '2026-11-02' } })
  })

  it('editing an existing note shows its details and Delete offers Undo', async () => {
    const user = userEvent.setup()
    ui()
    await user.click(cell(/^12 Nov/))
    await user.click(await screen.findByRole('button', { name: 'Call bank, edit' }))
    const dlg = await screen.findByRole('dialog', { name: 'Edit' })
    expect(within(dlg).getByLabelText('Title')).toHaveValue('Call bank')
    await user.click(within(dlg).getByRole('button', { name: 'Delete' }))
    expect(m.del).toHaveBeenCalledWith('n1')
    await waitFor(() => expect(useToasts.getState().toasts[0]?.message).toBe('"Call bank" deleted'))
    act(() => { useToasts.getState().toasts[0]?.actions[0]?.run() })
    expect(m.restore).toHaveBeenCalled()
  })

  it('a server error stays in the sheet', async () => {
    const user = userEvent.setup()
    m.save.mockRejectedValueOnce(new Error('permission denied'))
    ui()
    await user.click(cell(/^20 Nov/))
    await user.click(await screen.findByRole('button', { name: 'Add note / task' }))
    const dlg = await screen.findByRole('dialog', { name: 'Add note or task' })
    await user.type(within(dlg).getByLabelText('Title'), 'X')
    await user.click(within(dlg).getByRole('button', { name: 'Save' }))
    expect(await within(dlg).findByText('permission denied')).toBeInTheDocument()
  })
})

describe('note reminders', () => {
  it('a reminder time is saved as the instant it means in the user\'s time zone', async () => {
    const user = userEvent.setup()
    ui()
    await user.click(cell(/^20 Nov/))
    await user.click(await screen.findByRole('button', { name: 'Add note / task' }))
    const dlg = await screen.findByRole('dialog', { name: 'Add note or task' })
    await user.type(within(dlg).getByLabelText('Title'), 'Call bank')
    fireEvent.change(within(dlg).getByLabelText('Remind me at (optional)'), { target: { value: '08:30' } })
    await user.click(within(dlg).getByRole('button', { name: 'Save' }))
    expect(m.save.mock.calls[0]?.[0].values).toMatchObject({ date: '2026-11-20', remind_at: '2026-11-20T03:00:00.000Z' }) // 08:30 in Kolkata
  })
  it('editing shows the existing reminder in local time, and clearing it saves null', async () => {
    const user = userEvent.setup()
    m.cal = month({ notes: [note({ remind_at: '2026-11-12T03:30:00.000Z' })] })
    ui()
    await user.click(cell(/^12 Nov/))
    await user.click(await screen.findByRole('button', { name: 'Call bank, edit' }))
    const dlg = await screen.findByRole('dialog', { name: 'Edit' })
    const time = within(dlg).getByLabelText('Remind me at (optional)')
    expect(time).toHaveValue('09:00')
    fireEvent.change(time, { target: { value: '' } })
    await user.click(within(dlg).getByRole('button', { name: 'Save' }))
    expect(m.save.mock.calls[0]?.[0].values.remind_at).toBeNull()
  })
})

describe('Agenda', () => {
  const window1 = (): AgendaWindow => ({
    from: '2026-11-12', to: '2026-12-11',
    items: [item({ due_date: '2026-11-14' }), item({ seq: 2, due_date: '2026-11-20', paid_paise: 100_000, paid_on: '2026-11-13', remaining_paise: 0 })],
    notes: [note({ date: '2026-11-18', title: 'Dentist', kind: 'note' })],
  })

  it('lists dated items grouped by day with Today as an anchor', async () => {
    const user = userEvent.setup()
    m.agenda = { pages: [window1()], pageParams: ['2026-11-12'] }
    ui()
    await user.click(screen.getByRole('tab', { name: 'Agenda' }))
    expect(localStorage.getItem('mm-cal-view')).toBe('agenda')
    const agenda = await screen.findByLabelText('Agenda')
    expect(within(agenda).getByRole('region', { name: 'Today' })).toHaveTextContent('Nothing today')
    expect(within(agenda).getByRole('button', { name: /^Loan, instalment 1, Overdue/ })).toBeInTheDocument()
    expect(within(agenda).getByRole('button', { name: /^Loan, instalment 2, Paid early/ })).toBeInTheDocument()
    expect(within(agenda).getByRole('button', { name: 'Dentist, note, edit' })).toBeInTheDocument()
    await user.click(within(agenda).getByRole('button', { name: /^Loan, instalment 1/ }))
    expect(screen.getByTestId('where')).toHaveTextContent('/money/entry/e1')
  })

  it('tapping a day header goes to that day in the month view', async () => {
    const user = userEvent.setup()
    m.agenda = { pages: [window1()], pageParams: ['2026-11-12'] }
    ui()
    await user.click(screen.getByRole('tab', { name: 'Agenda' }))
    await user.click(within(await screen.findByLabelText('Agenda')).getByRole('button', { name: 'Wed, 18 Nov' }))
    expect(await screen.findByRole('dialog', { name: 'Wednesday, 18 Nov 2026' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Month', hidden: true })).toHaveAttribute('aria-selected', 'true')
  })

  it('opens a note for editing', async () => {
    const user = userEvent.setup()
    m.agenda = { pages: [window1()], pageParams: ['2026-11-12'] }
    ui()
    await user.click(screen.getByRole('tab', { name: 'Agenda' }))
    await user.click(await screen.findByRole('button', { name: 'Dentist, note, edit' }))
    const dlg = await screen.findByRole('dialog', { name: 'Edit' })
    expect(within(dlg).getByLabelText('Title')).toHaveValue('Dentist')
    fireEvent.change(within(dlg).getByLabelText('Title'), { target: { value: 'Dentist 5pm' } })
    await user.click(within(dlg).getByRole('button', { name: 'Save' }))
    expect(m.save.mock.calls[0]?.[0]).toMatchObject({ id: 'n1', values: { kind: 'note', title: 'Dentist 5pm' } })
  })
})

describe('deep link: /calendar?day=', () => {
  const at = (path: string) => render(<MemoryRouter initialEntries={[path]}><Where /><CalendarScreen /></MemoryRouter>)

  it('opens that day\'s sheet and removes the parameter', async () => {
    at('/calendar?day=2026-11-20')
    expect(await screen.findByRole('dialog', { name: 'Friday, 20 Nov 2026' })).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/calendar$/)
  })
  it('switches to the month of a day in another month', async () => {
    at('/calendar?day=2026-12-05')
    await waitFor(() => expect(useUi.getState().month).toBe('2026-12'))
    expect(m.args[m.args.length - 1]?.[0]).toBe('2026-12')
  })
  it('keeps filters in the URL and ignores an invalid day', async () => {
    at('/calendar?day=2026-02-31&acc=11111111-1111-4111-8111-111111111111')
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/calendar?acc=11111111-1111-4111-8111-111111111111'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('leaves the Agenda view for the month view', async () => {
    localStorage.setItem('mm-cal-view', 'agenda')
    at('/calendar?day=2026-11-20')
    expect(await screen.findByRole('dialog', { name: 'Friday, 20 Nov 2026' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Month', hidden: true })).toHaveAttribute('aria-selected', 'true')
  })
})

