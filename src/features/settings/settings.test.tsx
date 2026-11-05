import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { save, archive, reorder } = vi.hoisted(() => ({
  save: vi.fn().mockResolvedValue(undefined), archive: vi.fn().mockResolvedValue(undefined), reorder: vi.fn(),
}))

const accounts = [
  { id: 'a1', name: 'Cash', type: 'cash', opening_balance_paise: 0, credit_limit_paise: null, statement_day: null, due_day: null, color: '#22c55e', sort: 0, archived: false },
  { id: 'a2', name: 'HDFC Card', type: 'credit_card', opening_balance_paise: 0, credit_limit_paise: 10_000_000, statement_day: 5, due_day: 25, color: '#ef4444', sort: 1, archived: false },
  { id: 'a3', name: 'Old Wallet', type: 'wallet', opening_balance_paise: 0, credit_limit_paise: null, statement_day: null, due_day: null, color: null, sort: 2, archived: true },
]
const balances = [
  { account_id: 'a1', balance_paise: 123_400, outstanding_paise: null },
  { account_id: 'a2', balance_paise: -3_200_000, outstanding_paise: 3_200_000 },
]
vi.mock('@/features/accounts/queries', () => ({
  useAccounts: () => ({ data: accounts, isPending: false }),
  useAccountBalances: () => ({ data: balances }),
  useSaveAccount: () => ({ mutateAsync: save, isPending: false }),
  useArchiveAccount: () => ({ mutateAsync: archive }),
  useReorderAccounts: () => ({ mutate: reorder }),
}))

import AccountsScreen from './AccountsScreen'

beforeAll(() => {
  // vaul needs these in jsdom
  window.matchMedia = window.matchMedia || ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false, onchange: null }) as MediaQueryList)
  globalThis.ResizeObserver = globalThis.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} }
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {})
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {})
})
beforeEach(() => vi.clearAllMocks())

const ui = () => render(<MemoryRouter><AccountsScreen /></MemoryRouter>)

describe('Accounts screen', () => {
  it('lists active accounts with balances and credit-card utilisation; archived are tucked away', () => {
    ui()
    const cash = screen.getByRole('button', { name: 'Edit Cash' })
    expect(cash).toHaveTextContent('₹1,234')
    const card = screen.getByRole('button', { name: 'Edit HDFC Card' })
    expect(card).toHaveTextContent('Owed ₹32,000')
    expect(within(card).getByRole('img')).toHaveAccessibleName('32% of limit used')
    expect(screen.queryByText('Old Wallet')).toBeNull()
    expect(screen.getByRole('button', { name: /Show archived \(1\)/ })).toBeInTheDocument()
  })

  it('first row cannot move up, last cannot move down; moving calls reorder', async () => {
    ui()
    expect(screen.getByRole('button', { name: 'Move Cash up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move HDFC Card down' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Move Cash down' }))
    expect(reorder).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1', dir: 'down' }))
  })

  it('new account: validates, then saves the converted values', async () => {
    const user = userEvent.setup()
    ui()
    await user.click(screen.getByRole('button', { name: 'Add' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await within(dialog).findByText('Enter a name')).toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()

    await user.type(within(dialog).getByLabelText('Name'), 'Savings')
    await user.type(within(dialog).getByLabelText('Opening balance (₹)'), '2,500.50')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(save).toHaveBeenCalledOnce())
    expect(save.mock.calls[0]?.[0]).toMatchObject({ id: undefined, values: { name: 'Savings', type: 'bank', opening_balance_paise: 250_050 } })
  })

  it('a credit card shows limit and day fields, and saves what you owe as a negative balance', async () => {
    const user = userEvent.setup()
    ui()
    await user.click(screen.getByRole('button', { name: 'Add' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByLabelText('Credit limit (₹)')).toBeNull()
    await user.selectOptions(within(dialog).getByLabelText('Type'), 'credit_card')
    await user.type(within(dialog).getByLabelText('Name'), 'ICICI')
    await user.type(within(dialog).getByLabelText('Already owed on this card (₹)'), '1000')
    await user.type(within(dialog).getByLabelText('Credit limit (₹)'), '50000')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(save).toHaveBeenCalled())
    expect(save.mock.calls[0]?.[0].values).toMatchObject({ type: 'credit_card', opening_balance_paise: -100_000, credit_limit_paise: 5_000_000 })
  })

  it('editing offers archive', async () => {
    const user = userEvent.setup()
    ui()
    await user.click(screen.getByRole('button', { name: 'Edit Cash' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Cash')
    await user.click(within(dialog).getByRole('button', { name: 'Archive account' }))
    await waitFor(() => expect(archive).toHaveBeenCalledWith({ id: 'a1', archived: true }))
  })
})
