import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToasts } from '@/ui/toastStore'

const m = vi.hoisted(() => ({
  entry: undefined as unknown, record: vi.fn(), delPayment: vi.fn(), unpaid: vi.fn(), delEntry: vi.fn(), update: vi.fn(),
  skip: vi.fn(), change: vi.fn(), extra: vi.fn(),
}))

vi.mock('./queries', () => ({
  useEntry: () => ({ data: m.entry, isPending: false, isError: false, refetch: vi.fn() }),
  useRecordPayment: () => ({ mutateAsync: m.record, mutate: m.record, isPending: false }),
  useDeletePayment: () => ({ mutateAsync: m.delPayment, isPending: false }),
  useMarkUnpaid: () => ({ mutateAsync: m.unpaid, isPending: false }),
  useDeleteEntry: () => ({ mutateAsync: m.delEntry, isPending: false }),
  useUpdateEntry: () => ({ mutateAsync: m.update, isPending: false }),
  usePeople: () => ({ data: [{ id: 'p1', name: 'Ravi', archived: false }, { id: 'p2', name: 'Meera', archived: false }] }),
  usePlanEdit: (kind: string) => ({ mutateAsync: kind === 'skip' ? m.skip : m.change, isPending: false }),
  useExtraPayment: () => ({ mutateAsync: m.extra, isPending: false }),
}))
vi.mock('@/features/accounts/queries', () => ({
  useAccounts: () => ({ data: [{ id: 'cash', name: 'Cash', archived: false }, { id: 'bank', name: 'Bank', archived: false }] }),
}))
vi.mock('@/features/profile/useToday', () => ({ useToday: () => '2026-11-15', useWeekStart: () => 1 }))

import EntryScreen from './EntryScreen'

const detail = (o: Record<string, unknown> = {}, paid = 400_000, payments: unknown[] = [
  { id: 'pay1', entry_id: 'e1', schedule_item_id: 's1', amount_paise: 400_000, paid_on: '2026-11-10', account_id: 'bank', mode: 'upi', note: 'part', created_at: '2026-11-10T10:00:00Z', txn_id: 't1' },
]) => ({
  id: 'e1', kind: 'lent', direction: 'receive', person_id: 'p1', title: 'Loan to Ravi', principal_paise: 1_000_000, start_date: '2026-11-01', due_date: '2026-12-01',
  interest: 'none', rate_bps: 0, total_payable_paise: 1_000_000, status: paid >= 1_000_000 ? 'settled' : 'open', settled_on: null, notes: 'for rent',
  schedule_items: [{ id: 's1', entry_id: 'e1', seq: 1, due_date: '2026-12-01', due_paise: 1_000_000, principal_paise: 1_000_000, interest_paise: 0, paid_paise: paid, paid_on: null }],
  payments, people: { id: 'p1', name: 'Ravi', phone: null }, ...o,
})

beforeAll(() => {
  window.matchMedia = window.matchMedia || ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false, onchange: null }) as MediaQueryList)
  globalThis.ResizeObserver = globalThis.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} }
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {})
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {})
})

beforeEach(() => {
  vi.clearAllMocks()
  m.entry = detail()
  m.record.mockResolvedValue({})
  m.unpaid.mockResolvedValue(undefined)
  m.delEntry.mockResolvedValue(undefined)
  m.update.mockResolvedValue(undefined)
  m.skip.mockResolvedValue(undefined)
  m.change.mockResolvedValue(undefined)
  m.extra.mockResolvedValue(undefined)
  m.delPayment.mockResolvedValue({ id: 'pay1', entry_id: 'e1', amount_paise: 400_000, paid_on: '2026-11-10', account_id: 'bank', mode: 'upi', note: 'part' })
  useToasts.setState({ toasts: [] })
})

function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}</div> }
const ui = () => render(
  <MemoryRouter initialEntries={['/money/entry/e1']}>
    <Where />
    <Routes><Route path="*" element={<EntryScreen id="e1" />} /></Routes>
  </MemoryRouter>)

describe('Entry detail', () => {
  it('shows what is left, progress, due text, payments and notes', () => {
    ui()
    const p = screen.getByRole('region', { name: 'Progress' })
    expect(p).toHaveTextContent('Partial')
    expect(p).toHaveTextContent('Still to receive')
    expect(p).toHaveTextContent('₹6,000')
    expect(p).toHaveTextContent('₹4,000 paid')
    expect(within(p).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40')
    expect(screen.getByText('for rent')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Payments' })).toHaveTextContent('₹4,000')
    expect(screen.getByRole('region', { name: 'Payments' })).toHaveTextContent('upi · part')
  })

  it('overdue entries say so', () => {
    m.entry = detail({ due_date: '2026-11-01', schedule_items: [{ ...(detail().schedule_items[0]!), due_date: '2026-11-01' }] })
    ui()
    expect(screen.getByRole('region', { name: 'Progress' })).toHaveTextContent('Overdue')
    expect(screen.getByRole('region', { name: 'Progress' })).toHaveTextContent('14 days overdue')
  })

  it('Receive: defaults to the full amount left, blocks overpayment, then records a payment', async () => {
    const user = userEvent.setup()
    ui()
    await user.click(screen.getByRole('button', { name: 'Receive money' }))
    const dialog = await screen.findByRole('dialog')
    const amount = within(dialog).getByLabelText('Amount')
    expect(amount).toHaveValue('6000')
    const into = within(within(dialog).getByRole('group', { name: 'Received into' }))
    expect(into.getByRole('button', { name: 'Bank' })).toHaveAttribute('aria-pressed', 'true') // account of the last payment

    await user.clear(amount)
    await user.type(amount, '6001')
    await user.click(within(dialog).getByRole('button', { name: 'Receive' }))
    expect(await within(dialog).findByText('That is more than the ₹6,000 left')).toBeInTheDocument()
    expect(m.record).not.toHaveBeenCalled()

    await user.clear(amount)
    await user.type(amount, '2500')
    await user.click(into.getByRole('button', { name: 'Cash' }))
    await user.click(within(dialog).getByRole('button', { name: 'Receive' }))
    expect(m.record).toHaveBeenCalledOnce()
    expect(m.record.mock.calls[0]?.[0]).toMatchObject({ entry_id: 'e1', amount_paise: 250_000, paid_on: '2026-11-15', account_id: 'cash' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(useToasts.getState().toasts[0]?.message).toBe('Received ₹2,500')
  })

  it('paying the exact remainder says Settled in full', async () => {
    const user = userEvent.setup()
    ui()
    await user.click(screen.getByRole('button', { name: 'Receive money' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Receive' }))
    expect(m.record.mock.calls[0]?.[0].amount_paise).toBe(600_000)
    expect(useToasts.getState().toasts[0]?.message).toBe('Settled in full')
  })

  it('borrowed entries say Pay back and Pay', async () => {
    const user = userEvent.setup()
    m.entry = detail({ kind: 'borrowed', direction: 'pay' })
    ui()
    expect(screen.getByRole('region', { name: 'Progress' })).toHaveTextContent('Still to pay')
    await user.click(screen.getByRole('button', { name: 'Pay back' }))
    expect(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Pay' })).toBeInTheDocument()
  })

  it('deleting a payment offers Undo, which records it again with the same id', async () => {
    const user = userEvent.setup()
    ui()
    await user.click(screen.getByRole('button', { name: 'Delete payment of ₹4,000' }))
    expect(m.delPayment).toHaveBeenCalledWith('pay1')
    await waitFor(() => expect(useToasts.getState().toasts[0]?.message).toBe('Payment of ₹4,000 deleted'))
    act(() => { useToasts.getState().toasts[0]?.actions[0]?.run() })
    expect(m.record).toHaveBeenCalledWith({ id: 'pay1', entry_id: 'e1', amount_paise: 400_000, paid_on: '2026-11-10', account_id: 'bank', mode: 'upi', note: 'part', target_seq: null })
  })

  it('Mark as unpaid asks first and says what it removes', async () => {
    const user = userEvent.setup()
    ui()
    await user.click(screen.getByRole('button', { name: 'Mark as unpaid' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('removes all 1 payment')
    expect(m.unpaid).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Mark as unpaid' }))
    await waitFor(() => expect(m.unpaid).toHaveBeenCalledWith('e1'))
  })

  it('Mark as unpaid is disabled with no payments', () => {
    m.entry = detail({}, 0, [])
    ui()
    expect(screen.getByRole('button', { name: 'Mark as unpaid' })).toBeDisabled()
    expect(screen.getByRole('region', { name: 'Payments' })).toHaveTextContent('No payments yet')
  })

  it('Delete entry confirms, deletes and goes back to Money', async () => {
    const user = userEvent.setup()
    ui()
    await user.click(screen.getByRole('button', { name: 'Delete entry' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('account balances go back')
    await user.click(within(dialog).getByRole('button', { name: 'Delete entry' }))
    await waitFor(() => expect(m.delEntry).toHaveBeenCalledWith('e1'))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/money'))
  })

  it('a settled entry shows no Receive button', () => {
    m.entry = detail({ settled_on: '2026-11-14' }, 1_000_000)
    ui()
    expect(screen.queryByRole('button', { name: 'Receive money' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Progress' })).toHaveTextContent('Paid')
  })

  it('shows interest details, including accrued-to-date for simple interest', () => {
    m.entry = detail({ interest: 'simple', rate_bps: 1200, total_payable_paise: 1_059_507, start_date: '2026-01-01', due_date: '2026-07-01' })
    ui()
    expect(screen.getByText(/Simple 12% a year/)).toBeInTheDocument()
    expect(screen.getByText(/Accrued so far/)).toBeInTheDocument()
  })

  it('Edit saves only what changed', async () => {
    const user = userEvent.setup()
    ui()
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    await user.clear(within(dialog).getByLabelText('Title'))
    await user.type(within(dialog).getByLabelText('Title'), 'Rent loan')
    fireEvent.change(within(dialog).getByLabelText('Due date'), { target: { value: '' } })
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(m.update).toHaveBeenCalledWith({ id: 'e1', patch: { title: 'Rent loan', notes: 'for rent', due_date: null } })
  })
})

// ---------------------------------------------------------------- plans (several rows)
const planRow = (seq: number, due: string, o: Record<string, unknown> = {}) => ({
  id: `s${seq}`, entry_id: 'e1', seq, due_date: due, due_paise: 100_000, principal_paise: 100_000, interest_paise: 0, paid_paise: 0, paid_on: null, ...o,
})
const plan = (o: Record<string, unknown> = {}, rows = [
  planRow(1, '2026-11-10'), planRow(2, '2026-12-10'), planRow(3, '2027-01-10'), planRow(4, '2027-02-10'),
], payments: unknown[] = []) => ({
  ...detail({ kind: 'borrowed', direction: 'pay', principal_paise: 400_000, total_payable_paise: 400_000, start_date: '2026-10-01', due_date: '2027-02-10', notes: null, ...o }, 0, payments),
  schedule_items: rows,
})

describe('Entry detail for plans', () => {
  it('lists the rows with early / on-time / late / overdue / upcoming labels', () => {
    m.entry = plan({}, [
      planRow(1, '2026-11-05', { paid_paise: 100_000, paid_on: '2026-11-01' }), // paid early
      planRow(2, '2026-11-10', { paid_paise: 100_000, paid_on: '2026-11-12' }), // paid late
      planRow(3, '2026-11-12'), // overdue
      planRow(4, '2026-11-20'), // upcoming
    ])
    ui()
    const list = screen.getByRole('region', { name: 'Instalments' })
    expect(list).toHaveTextContent('2 of 4 paid')
    const items = within(list).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Paid early (4 days)')
    expect(items[1]).toHaveTextContent('Paid late (2 days)')
    expect(items[2]).toHaveTextContent('Overdue (3 days late)')
    expect(items[3]).toHaveTextContent('Due in 5 days')
    expect(screen.getByRole('region', { name: 'Progress' })).toHaveTextContent('Overdue')
  })

  it('totals come from rows and extra payments: paid ÷ (paid + still due)', () => {
    m.entry = plan({}, [planRow(1, '2026-12-10', { due_paise: 40_000, principal_paise: 40_000 })], [
      { id: 'x1', entry_id: 'e1', schedule_item_id: null, amount_paise: 260_000, paid_on: '2026-11-10', account_id: 'bank', mode: null, note: null, created_at: '2026-11-10T10:00:00Z', txn_id: 't9' },
    ])
    ui()
    const p = screen.getByRole('region', { name: 'Progress' })
    expect(p).toHaveTextContent('₹400')
    expect(p).toHaveTextContent('₹2,600 paid')
    expect(p).toHaveTextContent('of ₹3,000')
    expect(screen.getByRole('region', { name: 'Payments' })).toHaveTextContent('extra payment')
    expect(screen.queryByRole('button', { name: /Delete payment/ })).toBeNull() // extra payments cannot be undone
    expect(screen.getByRole('button', { name: 'Mark as unpaid' })).toBeDisabled()
    expect(screen.getByText(/shortened by an extra payment/)).toBeInTheDocument()
  })

  it('Pay on a row targets that row and suggests its amount (scenario D: pay row 3 first)', async () => {
    const user = userEvent.setup()
    ui()
    m.entry = plan({}, [planRow(1, '2026-03-01'), planRow(2, '2026-03-08'), planRow(3, '2026-03-15'), planRow(4, '2026-03-22')])
    ui()
    await user.click(screen.getAllByRole('button', { name: 'Pay instalment 3' })[0]!)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Amount')).toHaveValue('1000')
    await user.click(within(dialog).getByRole('button', { name: 'Pay' }))
    expect(m.record.mock.calls[0]?.[0]).toMatchObject({ entry_id: 'e1', amount_paise: 100_000, target_seq: 3 })
  })

  it('the main button suggests the next instalment, with chips for everything left', async () => {
    const user = userEvent.setup()
    m.entry = plan({}, [planRow(1, '2026-11-10', { paid_paise: 100_000, paid_on: '2026-11-09' }), planRow(2, '2026-12-10'), planRow(3, '2027-01-10')])
    ui()
    await user.click(screen.getByRole('button', { name: 'Pay back' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Amount')).toHaveValue('1000')
    await user.click(within(dialog).getByRole('button', { name: 'Everything left' }))
    expect(within(dialog).getByLabelText('Amount')).toHaveValue('2000')
    await user.click(within(dialog).getByRole('button', { name: 'Pay' }))
    expect(m.record.mock.calls[0]?.[0]).toMatchObject({ amount_paise: 200_000, target_seq: null })
  })

  it('Skip month previews the move, then sends base and new rows', async () => {
    const user = userEvent.setup()
    m.entry = plan({}, [planRow(1, '2026-01-31', { paid_paise: 100_000, paid_on: '2026-01-31' }), planRow(2, '2026-02-28'), planRow(3, '2026-03-31'), planRow(4, '2026-04-30')])
    ui()
    await user.click(screen.getByRole('button', { name: 'Skip month from instalment 2' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('region', { name: 'What will change' })).toHaveTextContent('#2 to #4 each move one month later')
    await user.click(within(dialog).getByRole('button', { name: 'Skip month' }))
    const arg = m.skip.mock.calls[0]?.[0]
    expect(arg.entryId).toBe('e1')
    expect(arg.base).toHaveLength(4)
    expect(arg.rows.map((r: { due_date: string }) => r.due_date)).toEqual(['2026-01-31', '2026-03-31', '2026-04-30', '2026-05-31'])
  })

  it('Change amount previews the re-spread and refuses an amount below what is paid', async () => {
    const user = userEvent.setup()
    m.entry = plan({}, [planRow(1, '2026-12-10', { paid_paise: 30_000 }), planRow(2, '2027-01-10'), planRow(3, '2027-02-10'), planRow(4, '2027-03-10')])
    ui()
    await user.click(screen.getByRole('button', { name: 'Change amount of instalment 1' }))
    const dialog = await screen.findByRole('dialog')
    const input = within(dialog).getByLabelText('New amount')
    await user.clear(input)
    await user.type(input, '200')
    expect(within(dialog).getByRole('alert')).toBeInTheDocument() // below the ₹300 already paid
    expect(within(dialog).getByRole('button', { name: 'Change amount' })).toBeDisabled()
    await user.clear(input)
    await user.type(input, '1300')
    expect(within(dialog).getByRole('region', { name: 'What will change' })).toHaveTextContent('#1: ₹1,000 → ₹1,300')
    await user.click(within(dialog).getByRole('button', { name: 'Change amount' }))
    expect(m.change.mock.calls[0]?.[0].rows[0]).toMatchObject({ seq: 1, due_paise: 130_000 })
  })

  it('Extra payment previews removed rows and the new last date, blocks more than is left, and sends rows', async () => {
    const user = userEvent.setup()
    m.entry = plan()
    ui()
    await user.click(screen.getByRole('button', { name: 'Extra payment' }))
    const dialog = await screen.findByRole('dialog')
    const input = within(dialog).getByLabelText('Extra amount')
    await user.type(input, '5000')
    expect(within(dialog).getByText('That is more than the ₹4,000 left')).toBeInTheDocument()
    await user.clear(input)
    await user.type(input, '2500')
    const preview = within(dialog).getByRole('region', { name: 'What will change' })
    expect(preview).toHaveTextContent('#4')
    expect(preview).toHaveTextContent('removed')
    expect(preview).toHaveTextContent('The plan now ends on')
    await user.click(within(dialog).getByRole('button', { name: 'Record extra payment' }))
    const arg = m.extra.mock.calls[0]?.[0]
    expect(arg).toMatchObject({ entry_id: 'e1', amount_paise: 250_000, account_id: 'cash', paid_on: '2026-11-15' })
    expect(arg.rows.map((r: { seq: number }) => r.seq)).toEqual([1, 2]) // #4 and #3 are cleared, #2 shrinks by ₹500
  })

  it('Prepay estimate shows foreclose and part-prepay figures', async () => {
    const user = userEvent.setup()
    m.entry = plan({}, [planRow(1, '2026-12-10', { due_paise: 110_000, principal_paise: 100_000, interest_paise: 10_000 }), planRow(2, '2027-01-10', { due_paise: 110_000, principal_paise: 100_000, interest_paise: 10_000 })])
    ui()
    await user.click(screen.getByRole('button', { name: 'Prepay estimate' }))
    const dialog = await screen.findByRole('dialog')
    const f = within(dialog).getByRole('region', { name: 'Foreclose' })
    expect(f).toHaveTextContent('Principal left₹2,000')
    expect(f).toHaveTextContent('Total to close₹2,000')
    expect(f).toHaveTextContent('Interest saved₹200')
    await user.type(within(dialog).getByLabelText('Prepay amount'), '1100')
    expect(within(dialog).getByRole('region', { name: 'Part prepayment' })).toHaveTextContent('2 → 1 instalments left')
  })

  it('EMI purchases show the store, price, down payment and no-cost note', () => {
    m.entry = plan({ kind: 'emi_purchase', party_name: 'Croma', people: null, person_id: null, no_cost: true, interest: 'reducing', rate_bps: 1500, down_payment_paise: 600_000, principal_paise: 400_000, title: 'Phone' })
    ui()
    expect(screen.getByText('Bought from')).toBeInTheDocument()
    expect(screen.getByText('Croma')).toBeInTheDocument()
    expect(screen.getByText('Price')).toBeInTheDocument()
    expect(screen.getByText('₹10,000')).toBeInTheDocument()
    expect(screen.getByText('Down payment')).toBeInTheDocument()
    expect(screen.getByText('No-cost EMI (no interest)')).toBeInTheDocument()
  })
})

