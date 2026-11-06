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

const open = (props: Partial<React.ComponentProps<typeof Sheet>> = {}) => render(
  <Sheet open onOpenChange={() => undefined} title="Test sheet" {...props}><input aria-label="Name" /><button>Other</button><button>Save</button></Sheet>,
)

describe('Sheet sizes', () => {
  it('auto: a bottom sheet capped at 92% of the screen, no close button, not positioned by the keyboard', () => {
    open()
    const d = screen.getByRole('dialog')
    expect(d).toHaveAttribute('data-size', 'auto')
    expect(d).toHaveClass('max-h-[92%]', 'bottom-0')
    expect(d.getAttribute('style') ?? '').not.toContain('--kb')
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
    expect(document.querySelector('.sheet-body-full')).toBeNull()
  })

  it('full: from just below the status bar to the bottom edge; nothing about the keyboard moves or resizes it', () => {
    open({ size: 'full' })
    const d = screen.getByRole('dialog')
    expect(d).toHaveAttribute('data-size', 'full')
    expect(d).toHaveClass('bottom-0')
    expect(d).not.toHaveClass('max-h-[92%]')
    const style = d.getAttribute('style') ?? ''
    expect(style).toMatch(/top: calc\((12px \+ env\(safe-area-inset-top, 0px\)|env\(safe-area-inset-top, 0px\) \+ 12px)\)/)
    expect(style).not.toContain('--kb')
    expect(style).not.toContain('--vv-h')
  })

  it('full: the scrolling body is a column with room at the end for the keyboard', () => {
    open({ size: 'full' })
    const body = document.querySelector('.sheet-body')!
    expect(body).toHaveClass('sheet-body-full', 'flex', 'flex-col', 'overflow-y-auto')
  })

  it('full: a Close button mirrors the pull-down gesture', async () => {
    const onOpenChange = vi.fn()
    open({ size: 'full', onOpenChange })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Close' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('keeps the title for screen readers when it is hidden', () => {
    open({ size: 'full', hideTitle: true })
    expect(screen.getByRole('dialog', { name: 'Test sheet' })).toBeInTheDocument()
    expect(screen.getAllByText('Test sheet').every((el) => el.classList.contains('sr-only'))).toBe(true)
  })
})

describe('focus', () => {
  it('scrolls a newly focused field into view once the keyboard has appeared; other elements are left alone', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    open({ size: 'full' })
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
