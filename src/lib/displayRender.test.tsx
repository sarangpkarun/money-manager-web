import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { formatDisplayDate, setDisplay, useDisplayVersion } from './display'
import { formatMoney } from './money'

// A component that subscribes to the version (as the Shell does) and renders children that read the module-level default.
function Child() { return <p data-testid="out">{formatMoney(123_456_700)} · {formatDisplayDate('2026-11-05')}</p> }
function Shellish() { useDisplayVersion((s) => s.version); return <Child /> }

describe('changing the display settings re-renders what is below the subscriber', () => {
  it('amounts and dates update without any prop change', () => {
    render(<Shellish />)
    expect(screen.getByTestId('out')).toHaveTextContent('₹12,34,567 · 5 Nov 2026')
    act(() => { setDisplay({ number: 'western' }) })
    expect(screen.getByTestId('out')).toHaveTextContent('₹1,234,567 · 5 Nov 2026')
    act(() => { setDisplay({ date: 'MMM dd, yyyy' }) })
    expect(screen.getByTestId('out')).toHaveTextContent('₹1,234,567 · Nov 5, 2026')
  })
})
