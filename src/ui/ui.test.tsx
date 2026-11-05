import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Amount } from './Amount'
import { Chip } from './Chip'
import { decideSwipe } from './SwipeRow'
import { Toaster } from './Toaster'
import { runToastAction, showUndo, useToasts } from './toastStore'

beforeEach(() => useToasts.setState({ toasts: [] }))

describe('Amount', () => {
  it('formats rupees with Indian grouping and optional sign', () => {
    const { container, rerender } = render(<Amount paise={123456700} />)
    expect(container).toHaveTextContent('₹12,34,567')
    rerender(<Amount paise={50000} tone="out" sign />)
    expect(container).toHaveTextContent('−₹500')
    rerender(<Amount paise={50000} tone="in" sign />)
    expect(container).toHaveTextContent('+₹500')
  })
  it('uses semantic colour tokens', () => {
    const { container } = render(<Amount paise={100} tone="in" />)
    expect(container.firstChild).toHaveClass('text-money-green')
  })
})

describe('Chip', () => {
  it('exposes selected state to assistive tech and handles clicks', () => {
    const onClick = vi.fn()
    render(<Chip selected onClick={onClick}>Food</Chip>)
    const b = screen.getByRole('button', { name: 'Food' })
    expect(b).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(b)
    expect(onClick).toHaveBeenCalledOnce()
  })
})

describe('toasts', () => {
  it('keeps at most 3, newest last', () => {
    for (let i = 1; i <= 5; i++) useToasts.getState().show({ message: `m${i}` })
    expect(useToasts.getState().toasts.map((t) => t.message)).toEqual(['m3', 'm4', 'm5'])
  })
  it('Undo runs the action once and removes the toast', () => {
    const undo = vi.fn()
    const id = showUndo('Deleted', undo)
    runToastAction(id)
    runToastAction(id)
    expect(undo).toHaveBeenCalledOnce()
    expect(useToasts.getState().toasts).toHaveLength(0)
  })
  it('supports several actions and runs only the chosen one', () => {
    const a = vi.fn(), b = vi.fn()
    const id = useToasts.getState().show({ message: 'Added', actions: [{ label: 'Undo', run: a }, { label: 'Add another', run: b }] })
    runToastAction(id, 1)
    expect(b).toHaveBeenCalledOnce()
    expect(a).not.toHaveBeenCalled()
    expect(useToasts.getState().toasts).toHaveLength(0)
  })
  it('renders, offers Undo and auto-dismisses', () => {
    vi.useFakeTimers()
    const undo = vi.fn()
    render(<Toaster />)
    act(() => { showUndo('Expense deleted', undo) })
    expect(screen.getByRole('status')).toHaveTextContent('Expense deleted')
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(undo).toHaveBeenCalled()
    act(() => { useToasts.getState().show({ message: 'bye', duration: 1000 }) })
    expect(screen.getByText('bye')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1100) })
    expect(screen.queryByText('bye')).toBeNull()
    vi.useRealTimers()
  })
})

describe('decideSwipe', () => {
  it('commits only past the threshold', () => {
    expect(decideSwipe(79)).toBeNull()
    expect(decideSwipe(80)).toBe('right')
    expect(decideSwipe(-80)).toBe('left')
    expect(decideSwipe(-79.9)).toBeNull()
    expect(decideSwipe(30, 20)).toBe('right')
  })
})
