import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActivityRow } from '@/lib/db'
import { useUi } from '@/lib/uiStore'
import { useToasts } from '@/ui/toastStore'

const m = vi.hoisted(() => ({
  add: vi.fn(), update: vi.fn(), del: vi.fn(), suggestions: { data: [] as unknown[] },
  createEntry: vi.fn(), deleteEntry: vi.fn(), savePerson: vi.fn(), createPlan: vi.fn(),
}))

const accounts = [
  { id: 'cash', name: 'Cash', type: 'cash', archived: false, color: '#22c55e', sort: 0 },
  { id: 'bank', name: 'Bank', type: 'bank', archived: false, color: '#3b82f6', sort: 1 },
  { id: 'card', name: 'HDFC Card', type: 'credit_card', archived: false, color: '#ef4444', sort: 2 },
  { id: 'old', name: 'Old', type: 'wallet', archived: true, color: null, sort: 3 },
]
const categories = [
  { id: 'food', name: 'Food', kind: 'expense', icon: null, color: null, sort: 0, archived: false },
  { id: 'travel', name: 'Travel', kind: 'expense', icon: null, color: null, sort: 1, archived: false },
  { id: 'salary', name: 'Salary', kind: 'income', icon: null, color: null, sort: 0, archived: false },
]

vi.mock('@/features/accounts/queries', () => ({ useAccounts: () => ({ data: accounts }) }))
vi.mock('@/features/categories/queries', () => ({ useCategories: () => ({ data: categories }) }))
vi.mock('@/features/profile/useToday', () => ({ useToday: () => '2026-11-05' }))
vi.mock('@/features/activity/queries', () => ({
  useRecentTransactions: () => ({ data: [{ kind: 'expense', category_id: 'travel', account_id: 'bank', date: '2026-11-01' }] }),
  useTitleSuggestions: () => m.suggestions,
  useAddTransaction: () => ({ mutateAsync: m.add }),
  useUpdateTransaction: () => ({ mutate: m.update }),
  useDeleteTransaction: () => ({ mutateAsync: m.del }),
}))

const people = [{ id: 'ravi', name: 'Ravi Kumar', archived: false }, { id: 'meera', name: 'Meera', archived: false }, { id: 'old', name: 'Old Friend', archived: true }]
vi.mock('@/features/money/queries', () => ({
  usePeople: () => ({ data: people }),
  useCreateEntry: () => ({ mutateAsync: m.createEntry }),
  useCreatePlan: () => ({ mutateAsync: m.createPlan }),
  useDeleteEntry: () => ({ mutateAsync: m.deleteEntry }),
  useSavePerson: () => ({ mutateAsync: m.savePerson }),
}))

import QuickAddSheet from './QuickAddSheet'

beforeAll(() => {
  window.matchMedia = window.matchMedia || ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false, onchange: null }) as MediaQueryList)
  globalThis.ResizeObserver = globalThis.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} }
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {})
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {})
  if (!globalThis.crypto?.randomUUID) Object.defineProperty(globalThis, 'crypto', { value: { randomUUID: () => '00000000-0000-4000-8000-000000000001' } })
})

beforeEach(() => {
  vi.clearAllMocks()
  m.add.mockResolvedValue({})
  m.update.mockImplementation((_v, opts) => opts?.onSuccess?.())
  m.del.mockResolvedValue({})
  m.createEntry.mockResolvedValue({})
  m.createPlan.mockResolvedValue({})
  m.deleteEntry.mockResolvedValue({})
  m.savePerson.mockResolvedValue({ id: 'new-person' })
  m.suggestions = { data: [] }
  localStorage.clear()
  useToasts.setState({ toasts: [] })
  useUi.setState({ quickAddOpen: false, quickAddPrefill: null })
})

const open = async (prefill?: Parameters<ReturnType<typeof useUi.getState>['openQuickAdd']>[0]) => {
  const user = userEvent.setup()
  render(<QuickAddSheet />)
  act(() => useUi.getState().openQuickAdd(prefill))
  const dialog = await screen.findByRole('dialog')
  return { user, dialog }
}
const toast = () => useToasts.getState().toasts[0]

describe('Quick Add: scenario E', () => {
  it('120 → Food → Save adds an expense on the default account, today, then closes with a toast', async () => {
    const { user, dialog } = await open()
    expect(within(dialog).getByLabelText('Amount')).toHaveFocus()
    await user.type(within(dialog).getByLabelText('Amount'), '120')
    await user.click(within(dialog).getByRole('button', { name: /Food/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(m.add).toHaveBeenCalledOnce()
    expect(m.add.mock.calls[0]?.[0]).toMatchObject({
      kind: 'expense', amount_paise: 12_000, category_id: 'food', account_id: 'cash', date: '2026-11-05', to_account_id: null,
    })
    expect(m.add.mock.calls[0]?.[0].id).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(toast()?.message).toBe('Added ₹120 · Food')
    expect(toast()?.actions.map((a) => a.label)).toEqual(['Undo', 'Add another'])
    expect(localStorage.getItem('mm-last-account')).toBe('cash')
  })

  it('remembers the last-used account', async () => {
    localStorage.setItem('mm-last-account', 'bank')
    const { user, dialog } = await open()
    expect(within(dialog).getByRole('button', { name: 'Bank' })).toHaveAttribute('aria-pressed', 'true')
    await user.type(within(dialog).getByLabelText('Amount'), '5')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(m.add.mock.calls[0]?.[0].account_id).toBe('bank')
  })

  it('shows only active accounts and ranks recently used categories first', async () => {
    const { dialog } = await open()
    expect(within(dialog).queryByRole('button', { name: 'Old' })).toBeNull()
    const chips = within(within(dialog).getByRole('group', { name: 'Category' })).getAllByRole('button').map((b) => b.textContent)
    expect(chips[0]).toContain('Travel') // used recently; Food comes after
  })
})

describe('amount entry', () => {
  it('"450+120" saves 57,000 paise and previews the result', async () => {
    const { user, dialog } = await open()
    await user.type(within(dialog).getByLabelText('Amount'), '450+120')
    expect(within(dialog).getByText('= ₹570')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(m.add.mock.calls[0]?.[0].amount_paise).toBe(57_000)
  })
  it('operator buttons insert symbols (the iOS decimal pad has none)', async () => {
    const { user, dialog } = await open()
    const amount = within(dialog).getByLabelText('Amount')
    await user.type(amount, '10')
    await user.click(within(dialog).getByRole('button', { name: 'Insert ×' }))
    await user.type(amount, '3')
    expect(amount).toHaveValue('10*3')
    expect(within(dialog).getByText('= ₹30')).toBeInTheDocument()
  })
  it('Enter saves', async () => {
    const { user, dialog } = await open()
    await user.type(within(dialog).getByLabelText('Amount'), '75{Enter}')
    expect(m.add).toHaveBeenCalled()
  })
  it('a blank or invalid amount shows an error and saves nothing', async () => {
    const { user, dialog } = await open()
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await within(dialog).findByText('Enter an amount')).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('Amount'), '12+')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await within(dialog).findByText('Enter a valid amount')).toBeInTheDocument()
    expect(m.add).not.toHaveBeenCalled()
  })
})

describe('types', () => {
  it('Received shows income categories', async () => {
    const { user, dialog } = await open()
    await user.click(within(dialog).getByRole('radio', { name: 'Received' }))
    const group = within(dialog).getByRole('group', { name: 'Category' })
    expect(within(group).getByRole('button', { name: /Salary/ })).toBeInTheDocument()
    expect(within(group).queryByRole('button', { name: /Food/ })).toBeNull()
    await user.type(within(dialog).getByLabelText('Amount'), '50000')
    await user.click(within(group).getByRole('button', { name: /Salary/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(m.add.mock.calls[0]?.[0]).toMatchObject({ kind: 'income', amount_paise: 5_000_000, category_id: 'salary' })
  })

  it('switching type clears the chosen category', async () => {
    const { user, dialog } = await open()
    await user.click(within(dialog).getByRole('button', { name: /Food/ }))
    await user.click(within(dialog).getByRole('radio', { name: 'Received' }))
    await user.click(within(dialog).getByRole('radio', { name: 'Spent' }))
    expect(within(dialog).getByRole('button', { name: /Food/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('Transfer needs a destination, hides categories and can pay a credit-card bill', async () => {
    const { user, dialog } = await open()
    await user.click(within(dialog).getByRole('radio', { name: 'Transfer' }))
    expect(within(dialog).queryByRole('group', { name: 'Category' })).toBeNull()
    await user.type(within(dialog).getByLabelText('Amount'), '10000')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await within(dialog).findByText('Pick where it goes')).toBeInTheDocument()
    const to = within(dialog).getByRole('group', { name: 'Destination account' })
    expect(within(to).queryByRole('button', { name: 'Cash' })).toBeNull() // not the same account as "From"
    await user.click(within(to).getByRole('button', { name: /HDFC Card/ }))
    expect(within(dialog).getByText('To · paying card bill')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(m.add.mock.calls[0]?.[0]).toMatchObject({ kind: 'transfer', account_id: 'cash', to_account_id: 'card', category_id: null, amount_paise: 1_000_000 })
  })
})

describe('more fields', () => {
  it('place, note and tags are saved when added', async () => {
    const { user, dialog } = await open()
    await user.type(within(dialog).getByLabelText('Amount'), '90')
    await user.click(within(dialog).getByRole('button', { name: '+ Place' }))
    await user.click(within(dialog).getByRole('button', { name: '+ Note' }))
    await user.click(within(dialog).getByRole('button', { name: '+ Tags' }))
    await user.type(within(dialog).getByLabelText('Place'), 'Cafe Blue')
    await user.type(within(dialog).getByLabelText('Note'), 'with Arun')
    await user.type(within(dialog).getByLabelText('Tags'), '#Work trip')
    await user.type(within(dialog).getByLabelText('Title'), 'Chai')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(m.add.mock.calls[0]?.[0]).toMatchObject({ title: 'Chai', place: 'Cafe Blue', notes: 'with Arun', tags: ['work', 'trip'] })
  })
  it('the date can be changed; a calendar-day prefill is respected', async () => {
    const { dialog } = await open({ date: '2026-12-03' })
    expect(within(dialog).getByLabelText('Date')).toHaveValue('2026-12-03')
    expect(within(dialog).getByText(/2026-12-03/)).toBeInTheDocument()
  })
})

describe('title suggestions', () => {
  it('tapping a suggestion fills title, category, account and place', async () => {
    m.suggestions = { data: [{ title: 'Chai', category_id: 'food', account_id: 'bank', place: 'Cafe Blue', last_date: '2026-11-01', uses: 4 }] }
    const { user, dialog } = await open()
    await user.type(within(dialog).getByLabelText('Title'), 'ch')
    await user.click(await within(dialog).findByRole('option', { name: /Chai/ }))
    expect(within(dialog).getByLabelText('Title')).toHaveValue('Chai')
    expect(within(dialog).getByRole('button', { name: /Food/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(dialog).getByRole('button', { name: 'Bank' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(dialog).getByLabelText('Place')).toHaveValue('Cafe Blue')
  })
  it('does not offer a suggestion identical to what is typed', async () => {
    m.suggestions = { data: [{ title: 'Chai', category_id: null, account_id: null, place: null, last_date: '2026-11-01', uses: 1 }] }
    const { user, dialog } = await open()
    await user.type(within(dialog).getByLabelText('Title'), 'chai')
    expect(within(dialog).queryByRole('option')).toBeNull()
  })
})

describe('after saving', () => {
  it('Undo waits for the save, then deletes the same id', async () => {
    const { user, dialog } = await open()
    await user.type(within(dialog).getByLabelText('Amount'), '120')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    const id = m.add.mock.calls[0]?.[0].id
    await act(async () => toast()?.actions[0]?.run())
    await waitFor(() => expect(m.del).toHaveBeenCalledWith(id))
  })
  it('Add another reopens with the same type, account and date and an empty amount', async () => {
    const { user, dialog } = await open({ kind: 'income', date: '2026-12-03', accountId: 'bank' })
    await user.type(within(dialog).getByLabelText('Amount'), '500')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await act(async () => toast()?.actions[1]?.run())
    const again = await screen.findByRole('dialog')
    expect(within(again).getByLabelText('Amount')).toHaveValue('')
    expect(within(again).getByRole('radio', { name: 'Received' })).toHaveAttribute('aria-checked', 'true')
    expect(within(again).getByRole('button', { name: 'Bank' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(again).getByLabelText('Date')).toHaveValue('2026-12-03')
  })
  it('a failed save surfaces the error', async () => {
    m.add.mockRejectedValueOnce(new Error('network down'))
    const { user, dialog } = await open()
    await user.type(within(dialog).getByLabelText('Amount'), '120')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(useToasts.getState().toasts.some((t) => t.message.includes('network down'))).toBe(true))
  })
})

describe('edit mode', () => {
  const row = {
    id: 'tx1', kind: 'expense', amount_paise: 45_050, date: '2026-11-02', account_id: 'bank', account_name: 'Bank', to_account_id: null, to_account_name: null,
    category_id: 'travel', category_name: 'Travel', category_icon: null, category_color: null, title: 'Taxi', place: 'Airport', notes: null, tags: ['work'],
    for_other_paise: 0, entry_id: null, created_at: '2026-11-02T10:00:00Z',
  } as ActivityRow

  it('pre-fills the form and saves a patch instead of adding', async () => {
    const { user, dialog } = await open({ edit: row })
    expect(within(dialog).getByText('Edit transaction')).toBeInTheDocument()
    expect(within(dialog).queryByRole('radiogroup', { name: 'Type' })).toBeNull()
    expect(within(dialog).getByLabelText('Amount')).toHaveValue('450.5')
    expect(within(dialog).getByLabelText('Title')).toHaveValue('Taxi')
    expect(within(dialog).getByLabelText('Place')).toHaveValue('Airport')
    expect(within(dialog).getByLabelText('Tags')).toHaveValue('work')
    expect(within(dialog).getByRole('button', { name: 'Bank' })).toHaveAttribute('aria-pressed', 'true')
    await user.clear(within(dialog).getByLabelText('Amount'))
    await user.type(within(dialog).getByLabelText('Amount'), '500')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    expect(m.add).not.toHaveBeenCalled()
    expect(m.update.mock.calls[0]?.[0]).toMatchObject({ id: 'tx1', patch: { amount_paise: 50_000, title: 'Taxi', category_id: 'travel', account_id: 'bank' } })
    expect(toast()?.message).toBe('Updated ₹500 · Travel')
  })
})

describe('Lent / Borrowed', () => {
  it('Lent: person, amount, due date → create_entry payload; toast with Undo deletes the entry', async () => {
    const { user, dialog } = await open()
    await user.click(within(dialog).getByRole('radio', { name: 'Lent' }))
    expect(within(dialog).queryByRole('group', { name: 'Category' })).toBeNull() // no category for loans
    await user.type(within(dialog).getByLabelText('Amount'), '10000')
    await user.type(within(dialog).getByLabelText('Person'), 'rav')
    await user.click(within(dialog).getByRole('option', { name: 'Ravi Kumar' }))
    fireEvent.change(within(dialog).getByLabelText('Due date'), { target: { value: '2026-12-01' } })
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(m.createEntry).toHaveBeenCalledOnce()
    expect(m.createEntry.mock.calls[0]?.[0]).toMatchObject({
      kind: 'lent', person_id: 'ravi', title: 'Lent to Ravi Kumar', amount_paise: 1_000_000, account_id: 'cash', start_date: '2026-11-05',
      due_date: '2026-12-01', interest: 'none', rate_bps: 0,
    })
    expect(m.savePerson).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(toast()?.message).toBe('Lent ₹10,000 to Ravi Kumar')
    const id = m.createEntry.mock.calls[0]?.[0].id
    act(() => { toast()?.actions[0]?.run() })
    await waitFor(() => expect(m.deleteEntry).toHaveBeenCalledWith(id))
  })

  it('a person is required', async () => {
    const { user, dialog } = await open({ kind: 'lent' })
    await user.type(within(dialog).getByLabelText('Amount'), '500')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await within(dialog).findByText('Who is it with?')).toBeInTheDocument()
    expect(m.createEntry).not.toHaveBeenCalled()
  })

  it('a new name creates the person first, then the entry', async () => {
    const { user, dialog } = await open({ kind: 'borrowed' })
    await user.type(within(dialog).getByLabelText('Amount'), '2500')
    await user.type(within(dialog).getByLabelText('Person'), 'Priya')
    expect(within(dialog).getByText(/New person “Priya” will be added/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(m.savePerson).toHaveBeenCalledWith({ values: { name: 'Priya' } })
    expect(m.createEntry.mock.calls[0]?.[0]).toMatchObject({ kind: 'borrowed', person_id: 'new-person', title: 'Borrowed from Priya', amount_paise: 250_000 })
    expect(within(dialog).queryByRole('button', { name: '+ Place' })).toBeNull()
  })

  it('typing an existing name exactly reuses that person', async () => {
    const { user, dialog } = await open({ kind: 'lent' })
    await user.type(within(dialog).getByLabelText('Amount'), '100')
    await user.type(within(dialog).getByLabelText('Person'), 'meera')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(m.savePerson).not.toHaveBeenCalled()
    expect(m.createEntry.mock.calls[0]?.[0].person_id).toBe('meera')
  })

  it('opening from a person pre-selects them', async () => {
    const { user, dialog } = await open({ kind: 'lent', personId: 'ravi' })
    expect(within(dialog).getByLabelText('Person')).toHaveValue('Ravi Kumar')
    await user.type(within(dialog).getByLabelText('Amount'), '300')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(m.createEntry.mock.calls[0]?.[0].person_id).toBe('ravi')
  })

  it('flat interest shows the total and sends the rate', async () => {
    const { user, dialog } = await open({ kind: 'lent', personId: 'ravi' })
    await user.type(within(dialog).getByLabelText('Amount'), '10000')
    await user.click(within(dialog).getByRole('button', { name: 'Flat %' }))
    await user.type(within(dialog).getByLabelText(/Flat interest/), '10')
    expect(within(dialog).getByText('You get back ₹11,000 (₹1,000 interest)')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(m.createEntry.mock.calls[0]?.[0]).toMatchObject({ interest: 'flat', rate_bps: 1000 })
  })

  it('simple interest without a due date is refused', async () => {
    const { user, dialog } = await open({ kind: 'lent', personId: 'ravi' })
    await user.type(within(dialog).getByLabelText('Amount'), '10000')
    await user.click(within(dialog).getByRole('button', { name: 'Simple %' }))
    await user.type(within(dialog).getByLabelText(/Interest \(% a year/), '12')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await within(dialog).findByText('Simple interest needs a due date')).toBeInTheDocument()
    expect(m.createEntry).not.toHaveBeenCalled()
  })

  it('spent still saves a normal expense after switching back', async () => {
    const { user, dialog } = await open({ kind: 'lent' })
    await user.click(within(dialog).getByRole('radio', { name: 'Spent' }))
    await user.type(within(dialog).getByLabelText('Amount'), '90')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(m.add).toHaveBeenCalled()
    expect(m.createEntry).not.toHaveBeenCalled()
  })
})

describe('Repay in instalments / EMI chip', () => {
  it('Borrowed with a plan: 10 equal months, previewed live, sent as a plan with rows', async () => {
    const { user, dialog } = await open({ kind: 'borrowed', personId: 'ravi' })
    await user.type(within(dialog).getByLabelText('Amount'), '50000')
    await user.click(within(dialog).getByRole('button', { name: 'Repay in instalments' }))
    expect(within(dialog).queryByLabelText('Due date')).toBeNull() // the plan replaces the single due date
    expect(within(dialog).queryByRole('group', { name: 'Interest' })).toBeNull()
    await user.type(within(dialog).getByLabelText('Number of months'), '10')
    fireEvent.change(within(dialog).getByLabelText('First instalment'), { target: { value: '2026-12-05' } })
    const preview = within(dialog).getByRole('region', { name: 'Plan preview' })
    expect(preview).toHaveTextContent('10 × ₹5,000')
    expect(preview).toHaveTextContent('last 2027-09-05')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(m.createEntry).not.toHaveBeenCalled()
    expect(m.createPlan).toHaveBeenCalledOnce()
    const p = m.createPlan.mock.calls[0]?.[0]
    expect(p).toMatchObject({ kind: 'borrowed', person_id: 'ravi', principal_paise: 5_000_000, down_paise: 0, interest: 'none', rate_bps: 0, no_cost: false, start_date: '2026-11-05' })
    expect(p.rows).toHaveLength(10)
    expect(p.rows[1]).toEqual({ seq: 2, due_date: '2027-01-05', due_paise: 500_000, principal_paise: 500_000, interest_paise: 0 })
    await waitFor(() => expect(toast()?.message).toBe('Borrowed ₹50,000 from Ravi Kumar in 10 instalments'))
  })

  it('an incomplete plan blocks saving and says what is missing', async () => {
    const { user, dialog } = await open({ kind: 'lent', personId: 'ravi' })
    await user.type(within(dialog).getByLabelText('Amount'), '1000')
    await user.click(within(dialog).getByRole('button', { name: 'Repay in instalments' }))
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await within(dialog).findAllByText('How many instalments?')).not.toHaveLength(0)
    expect(m.createPlan).not.toHaveBeenCalled()
  })

  it('turning the plan off returns to a single repayment', async () => {
    const { user, dialog } = await open({ kind: 'lent', personId: 'ravi' })
    await user.click(within(dialog).getByRole('button', { name: 'Repay in instalments' }))
    await user.click(within(dialog).getByRole('button', { name: 'Repay in instalments' }))
    expect(within(dialog).getByLabelText('Due date')).toBeInTheDocument()
  })

  it('the EMI / instalments chip closes Quick Add and opens the EMI sheet', async () => {
    const { user, dialog } = await open()
    await user.click(within(dialog).getByRole('button', { name: /EMI \/ instalments/ }))
    expect(useUi.getState()).toMatchObject({ quickAddOpen: false, emiOpen: true })
  })
})

