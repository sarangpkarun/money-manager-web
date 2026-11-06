import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useOnline } from '@/lib/online'
import { ErrorState } from './ErrorState'
import { OfflineBanner } from './OfflineBanner'

const setOnline = (v: boolean) => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(v)
  act(() => { window.dispatchEvent(new Event(v ? 'online' : 'offline')) })
}
afterEach(() => vi.restoreAllMocks())

function Probe() { return <span data-testid="p">{String(useOnline())}</span> }

describe('useOnline', () => {
  it('starts from navigator.onLine and follows the online/offline events, then unsubscribes', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    const { unmount } = render(<Probe />)
    expect(screen.getByTestId('p')).toHaveTextContent('true')
    setOnline(false)
    expect(screen.getByTestId('p')).toHaveTextContent('false')
    setOnline(true)
    expect(screen.getByTestId('p')).toHaveTextContent('true')
    const remove = vi.spyOn(window, 'removeEventListener')
    unmount()
    expect(remove).toHaveBeenCalledWith('online', expect.any(Function))
    expect(remove).toHaveBeenCalledWith('offline', expect.any(Function))
  })
})

describe('OfflineBanner', () => {
  it('shows only while offline, as a polite status', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    render(<OfflineBanner />)
    expect(screen.queryByRole('status')).toBeNull()
    setOnline(false)
    expect(screen.getByRole('status')).toHaveTextContent("You're offline. Showing saved data.")
    setOnline(true)
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('ErrorState', () => {
  it('names what failed, offers Retry and calls it', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    const retry = vi.fn()
    render(<ErrorState what="your dashboard" onRetry={retry} />)
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load your dashboard.")
    expect(screen.queryByText(/offline/)).toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    expect(retry).toHaveBeenCalledOnce()
  })
  it('explains when the cause is no connection', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    render(<ErrorState what="the agenda" onRetry={() => undefined} />)
    expect(screen.getByRole('alert')).toHaveTextContent("You're offline. Reconnect and try again.")
  })
})

describe('explain', () => {
  it('blames the connection when offline, otherwise uses the error text', async () => {
    const { explain } = await import('@/lib/online')
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    expect(explain(new Error('Failed to fetch'))).toBe("you're offline")
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    expect(explain(new Error('permission denied'))).toBe('permission denied')
    expect(explain(new Error(''))).toBe('something went wrong')
    expect(explain('x')).toBe('something went wrong')
    expect(explain({ message: 'Arun has already paid ₹250' })).toBe('Arun has already paid ₹250') // Supabase errors are plain objects
    expect(explain(null)).toBe('something went wrong')
  })
})
