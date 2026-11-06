import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Sheet } from './Sheet'

beforeAll(() => {
  // vaul needs these in jsdom
  window.matchMedia = window.matchMedia || ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false, onchange: null }) as MediaQueryList)
  globalThis.ResizeObserver = globalThis.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} }
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {})
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {})
})
afterEach(() => vi.restoreAllMocks())

const open = () => render(<Sheet open onOpenChange={() => undefined} title="Test sheet"><input aria-label="Name" /><button>Other</button><div className="sheet-footer"><button>Save</button></div></Sheet>)

describe('Sheet keyboard handling', () => {
  it('sits on top of the keyboard and never grows taller than the visible area (CSS variables from lib/visualViewport)', () => {
    open()
    const style = screen.getByRole('dialog').getAttribute('style') ?? ''
    expect(style).toContain('bottom: var(--kb, 0px)')
    expect(style).toContain('--vv-h')
    expect(style).toContain('min(92%')
  })

  it('has the scrolling body and a sticky footer hook for a primary action', () => {
    open()
    expect(document.querySelector('.sheet-body')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save' }).parentElement).toHaveClass('sheet-footer')
  })

  it('scrolls a newly focused field into view once the keyboard has appeared; other elements are left alone', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    open()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await user.click(screen.getByRole('button', { name: 'Other' }))
    act(() => { vi.advanceTimersByTime(400) })
    expect(scrollIntoView).not.toHaveBeenCalled()
    await user.click(screen.getByLabelText('Name'))
    expect(scrollIntoView).not.toHaveBeenCalled() // not before the keyboard animation is over
    act(() => { vi.advanceTimersByTime(300) })
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
    vi.useRealTimers()
  })

  it('does not fail where scrollIntoView does not exist', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    ;(Element.prototype as { scrollIntoView?: unknown }).scrollIntoView = undefined
    open()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await user.click(screen.getByLabelText('Name'))
    expect(() => act(() => { vi.advanceTimersByTime(300) })).not.toThrow()
    vi.useRealTimers()
  })
})
