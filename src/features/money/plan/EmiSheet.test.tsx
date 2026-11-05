import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToasts } from '@/ui/toastStore'

const m = vi.hoisted(() => ({ create: vi.fn(), del: vi.fn() }))
vi.mock('../queries', () => ({ useCreatePlan: () => ({ mutateAsync: m.create, isPending: false }), useDeleteEntry: () => ({ mutateAsync: m.del }) }))
vi.mock('@/features/accounts/queries', () => ({ useAccounts: () => ({ data: [{ id: 'bank', name: 'Bank', archived: false }, { id: 'cash', name: 'Cash', archived: false }] }) }))
vi.mock('@/features/categories/queries', () => ({ useCategories: () => ({ data: [{ id: 'shop', name: 'Shopping', kind: 'expense', icon: null, archived: false }, { id: 'sal', name: 'Salary', kind: 'income', icon: null, archived: false }] }) }))
vi.mock('@/features/profile/useToday', () => ({ useToday: () => '2026-12-01' }))

import EmiSheet from './EmiSheet'

beforeAll(() => {
  window.matchMedia = window.matchMedia || ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false, onchange: null }) as MediaQueryList)
  globalThis.ResizeObserver = globalThis.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} }
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {})
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {})
})
beforeEach(() => { vi.clearAllMocks(); m.create.mockResolvedValue({}); m.del.mockResolvedValue({}); useToasts.setState({ toasts: [] }) })

const open = async () => {
  const onClose = vi.fn()
  const user = userEvent.setup()
  render(<EmiSheet open onClose={onClose} />)
  return { user, dialog: await screen.findByRole('dialog'), onClose }
}

describe('EMI / instalments sheet', () => {
  it('scenario C: ₹60,000 phone, ₹6,000 down, 9 months no-cost → previews and saves 9 rows', async () => {
    const { user, dialog, onClose } = await open()
    await user.type(within(dialog).getByLabelText('What did you buy?'), 'Phone')
    await user.type(within(dialog).getByLabelText('Store or lender'), 'Croma')
    await user.type(within(dialog).getByLabelText('Price (₹)'), '60000')
    await user.type(within(dialog).getByLabelText('Down payment (₹)'), '6000')
    expect(within(dialog).getByText('Financed: ₹54,000')).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('Months'), '9')
    fireEvent.change(within(dialog).getByLabelText('First instalment'), { target: { value: '2026-12-10' } })
    const preview = within(dialog).getByRole('region', { name: 'Plan preview' })
    expect(preview).toHaveTextContent('9 × ₹6,000')
    expect(preview).toHaveTextContent('interest ₹0')
    expect(preview).toHaveTextContent('last 2027-08-10')
    await user.click(within(within(dialog).getByRole('group', { name: 'Category' })).getByRole('button', { name: /Shopping/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(m.create).toHaveBeenCalledOnce()
    const p = m.create.mock.calls[0]?.[0]
    expect(p).toMatchObject({ kind: 'emi_purchase', party: 'Croma', person_id: null, title: 'Phone', principal_paise: 5_400_000, down_paise: 600_000, account_id: 'bank', category_id: 'shop', start_date: '2026-12-01', interest: 'reducing', no_cost: true })
    expect(p.rows).toHaveLength(9)
    expect(p.rows[8].due_date).toBe('2027-08-10')
    expect(p.rows.reduce((s: number, r: { due_paise: number }) => s + r.due_paise, 0)).toBe(5_400_000)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(useToasts.getState().toasts[0]?.message).toBe('Phone: 9 × ₹6,000')
  })

  it('EMI with interest needs a rate and shows the interest in the preview', async () => {
    const { user, dialog } = await open()
    await user.type(within(dialog).getByLabelText('Price (₹)'), '100000')
    await user.click(within(dialog).getByRole('button', { name: 'EMI with interest' }))
    await user.type(within(dialog).getByLabelText('Months'), '12')
    expect(within(dialog).getByRole('region', { name: 'Plan preview' })).toHaveTextContent('Enter an interest rate')
    await user.type(within(dialog).getByLabelText(/Interest \(% a year, reducing/), '12')
    expect(within(dialog).getByRole('region', { name: 'Plan preview' })).toHaveTextContent('11 × ₹8,884.88 + ₹8,884.85') // the last row absorbs the rounding
  })

  it('says what is missing and saves nothing', async () => {
    const { user, dialog } = await open()
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await within(dialog).findByText('What did you buy?', { selector: '[role=alert]' })).toBeInTheDocument()
    expect(within(dialog).getByText('Where from?', { selector: '[role=alert]' })).toBeInTheDocument()
    expect(within(dialog).getByText('Enter the price')).toBeInTheDocument()
    expect(m.create).not.toHaveBeenCalled()
  })

  it('the down payment must be less than the price', async () => {
    const { user, dialog } = await open()
    await user.type(within(dialog).getByLabelText('What did you buy?'), 'TV')
    await user.type(within(dialog).getByLabelText('Store or lender'), 'Shop')
    await user.type(within(dialog).getByLabelText('Price (₹)'), '1000')
    await user.type(within(dialog).getByLabelText('Down payment (₹)'), '1000')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await within(dialog).findByText('The down payment must be less than the price')).toBeInTheDocument()
  })

  it('shows a server error and keeps the sheet open', async () => {
    m.create.mockRejectedValueOnce(new Error('rows do not add up'))
    const { user, dialog, onClose } = await open()
    await user.type(within(dialog).getByLabelText('What did you buy?'), 'TV')
    await user.type(within(dialog).getByLabelText('Store or lender'), 'Shop')
    await user.type(within(dialog).getByLabelText('Price (₹)'), '9000')
    await user.click(within(dialog).getByRole('button', { name: 'Equal split' }))
    await user.type(within(dialog).getByLabelText('Number of months'), '3')
    fireEvent.change(within(dialog).getByLabelText('First instalment'), { target: { value: '2026-12-10' } })
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await within(dialog).findByText('rows do not add up')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Instalments kind and custom dates', async () => {
    const { user, dialog } = await open()
    await user.click(within(dialog).getByRole('radio', { name: 'Instalments' }))
    await user.type(within(dialog).getByLabelText('What did you buy?'), 'Sofa')
    await user.type(within(dialog).getByLabelText('Store or lender'), 'Home Centre')
    await user.type(within(dialog).getByLabelText('Price (₹)'), '3000')
    await user.click(within(dialog).getByRole('button', { name: 'Custom dates' }))
    await user.click(within(dialog).getByRole('button', { name: '+ Add date' }))
    await user.click(within(dialog).getByRole('button', { name: '+ Add date' }))
    fireEvent.change(within(dialog).getByLabelText('Date 1'), { target: { value: '2027-02-01' } })
    fireEvent.change(within(dialog).getByLabelText('Date 2'), { target: { value: '2026-12-20' } })
    expect(within(dialog).getByRole('region', { name: 'Plan preview' })).toHaveTextContent('2 × ₹1,500')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    const p = m.create.mock.calls[0]?.[0]
    expect(p).toMatchObject({ kind: 'instalment', party: 'Home Centre', down_paise: 0, interest: 'none' })
    expect(p.rows.map((r: { due_date: string }) => r.due_date)).toEqual(['2026-12-20', '2027-02-01'])
    expect(within(dialog).queryByRole('button', { name: 'Simple %' })).toBeNull() // custom dates: no simple interest
  })
})
