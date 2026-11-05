import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account, Category } from '@/lib/db'
import { FilterSheet } from './FilterSheet'
import type { ActivityFilters } from './filters'

const accounts = [
  { id: 'a1', name: 'Cash', archived: false }, { id: 'a2', name: 'Bank', archived: false }, { id: 'a3', name: 'Old', archived: true },
] as Account[]
const categories = [
  { id: 'c1', name: 'Food', kind: 'expense', icon: null, archived: false }, { id: 'c2', name: 'Salary', kind: 'income', icon: null, archived: false },
  { id: 'c3', name: 'Gone', kind: 'expense', icon: null, archived: true },
] as Category[]

beforeAll(() => {
  window.matchMedia = window.matchMedia || ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false, onchange: null }) as MediaQueryList)
  globalThis.ResizeObserver = globalThis.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} }
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {})
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {})
})

const onApply = vi.fn()
const onClose = vi.fn()
beforeEach(() => vi.clearAllMocks())

const open = (filters: ActivityFilters = {}) => {
  render(<FilterSheet filters={filters} accounts={accounts} categories={categories} onApply={onApply} onClose={onClose} />)
  return screen.findByRole('dialog')
}

describe('FilterSheet', () => {
  it('offers active accounts and categories only', async () => {
    const dialog = await open()
    expect(within(dialog).getByRole('button', { name: 'Cash' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Old' })).toBeNull()
    expect(within(dialog).getByRole('button', { name: /Food/ })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /Salary/ })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /Gone/ })).toBeNull()
  })

  it('builds filters from the chips and inputs and applies them on Apply', async () => {
    const user = userEvent.setup()
    const dialog = await open()
    await user.click(within(dialog).getByRole('button', { name: 'This week' }))
    await user.click(within(dialog).getByRole('button', { name: 'Spent' }))
    await user.click(within(dialog).getByRole('button', { name: 'Cash' }))
    await user.click(within(dialog).getByRole('button', { name: /Food/ }))
    await user.type(within(dialog).getByLabelText('Min amount (₹)'), '100')
    await user.type(within(dialog).getByLabelText('Max amount (₹)'), '2,500.50')
    await user.type(within(dialog).getByLabelText('Place'), 'Cafe')
    await user.type(within(dialog).getByLabelText('Tag'), '#Work')
    expect(onApply).not.toHaveBeenCalled() // nothing until Apply
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }))
    expect(onApply).toHaveBeenCalledWith({
      preset: 'week', kinds: ['spend'], accounts: ['a1'], categories: ['c1'], min: 10_000, max: 250_050, place: 'Cafe', tag: 'work',
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('starts from the current filters and chips toggle off again', async () => {
    const user = userEvent.setup()
    const dialog = await open({ kinds: ['spend', 'transfer'], accounts: ['a2'], min: 5_000, q: 'chai' })
    expect(within(dialog).getByRole('button', { name: 'Spent' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(dialog).getByRole('button', { name: 'Received' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(dialog).getByLabelText('Min amount (₹)')).toHaveValue('50')
    await user.click(within(dialog).getByRole('button', { name: 'Spent' }))
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }))
    expect(onApply).toHaveBeenCalledWith({ kinds: ['transfer'], accounts: ['a2'], min: 5_000, q: 'chai' }) // search text is kept
  })

  it('custom dates appear only for Custom and are validated', async () => {
    const user = userEvent.setup()
    const dialog = await open()
    expect(within(dialog).queryByLabelText('From')).toBeNull()
    await user.click(within(dialog).getByRole('button', { name: 'Custom' }))
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }))
    expect(await within(dialog).findByText('Pick at least one date')).toBeInTheDocument()
    expect(onApply).not.toHaveBeenCalled()
    await user.type(within(dialog).getByLabelText('From'), '2026-01-01')
    await user.type(within(dialog).getByLabelText('To'), '2026-02-01')
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }))
    expect(onApply).toHaveBeenCalledWith({ preset: 'custom', from: '2026-01-01', to: '2026-02-01' })
  })

  it('shows amount errors and does not apply', async () => {
    const user = userEvent.setup()
    const dialog = await open()
    await user.type(within(dialog).getByLabelText('Min amount (₹)'), '500')
    await user.type(within(dialog).getByLabelText('Max amount (₹)'), '100')
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }))
    expect(await within(dialog).findByText('Maximum is below the minimum')).toBeInTheDocument()
    expect(onApply).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Clear all removes every filter but keeps the search text', async () => {
    const user = userEvent.setup()
    const dialog = await open({ kinds: ['spend'], accounts: ['a1'], q: 'taxi' })
    await user.click(within(dialog).getByRole('button', { name: 'Clear all' }))
    expect(onApply).toHaveBeenCalledWith({ q: 'taxi' })
    onApply.mockClear()
    await user.click(within(dialog).getByRole('button', { name: 'Clear all' }))
    expect(onApply).toHaveBeenCalledWith({ q: 'taxi' })
  })
})

describe('Paid for others, not returned yet', () => {
  it('toggles the chip and applies it as a filter', async () => {
    const user = userEvent.setup()
    const dialog = await open()
    const chip = within(dialog).getByRole('button', { name: 'Paid for others, not returned yet' })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    await user.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }))
    expect(onApply).toHaveBeenCalledWith({ others: 'pending' })
  })
  it('starts selected when the filter is already on, and Clear removes it', async () => {
    const user = userEvent.setup()
    const dialog = await open({ others: 'pending' })
    expect(within(dialog).getByRole('button', { name: 'Paid for others, not returned yet' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(dialog).getByRole('button', { name: 'Clear all' }))
    expect(onApply).toHaveBeenCalledWith({})
  })
})
