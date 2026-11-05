import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { ActivityRow } from '@/lib/db'
import { TxnDetail } from './TxnDetail'

beforeAll(() => {
  window.matchMedia = window.matchMedia || ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false, onchange: null }) as MediaQueryList)
  globalThis.ResizeObserver = globalThis.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} }
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {})
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {})
})

const row = (o: Partial<ActivityRow>): ActivityRow => ({
  id: 't1', kind: 'expense', amount_paise: 10_000, date: '2026-11-05', account_id: 'a', account_name: 'Cash', to_account_id: null, to_account_name: null,
  category_id: null, category_name: null, category_icon: null, category_color: null, title: 'Lunch', place: null, notes: null, tags: [],
  for_other_paise: 0, entry_id: null, created_at: '2026-11-05T10:00:00Z', ...o,
})

describe('TxnDetail', () => {
  it('ordinary transactions keep Edit and Delete', () => {
    render(<TxnDetail row={row({})} onClose={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('loan transactions cannot be deleted here: the detail points at the loan instead', async () => {
    const user = userEvent.setup()
    const onOpenEntry = vi.fn()
    render(<TxnDetail row={row({ kind: 'debt_out', entry_id: 'e9', title: 'Loan to Ravi' })} onClose={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} onOpenEntry={onOpenEntry} />)
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Open loan' }))
    expect(onOpenEntry).toHaveBeenCalledWith('e9')
  })
})
