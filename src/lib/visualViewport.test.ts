import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'
import { KEYBOARD_MIN, installViewportVars, keyboardInset, type ViewportEnv } from './visualViewport'

describe('keyboardInset', () => {
  it('is 0 without a keyboard or without visualViewport', () => {
    expect(keyboardInset(844, { height: 844, offsetTop: 0 })).toBe(0)
    expect(keyboardInset(844, null)).toBe(0)
    expect(keyboardInset(844, undefined)).toBe(0)
  })
  it('is the covered height with a keyboard', () => expect(keyboardInset(844, { height: 508, offsetTop: 0 })).toBe(336))
  it('accounts for iOS scrolling the layout up to show the field', () => expect(keyboardInset(844, { height: 508, offsetTop: 120 })).toBe(216))
  it('rounds and never goes negative', () => {
    expect(keyboardInset(844, { height: 843.4, offsetTop: 0 })).toBe(1)
    expect(keyboardInset(844, { height: 900, offsetTop: 0 })).toBe(0)
  })
  it('property: always an integer in [0, innerHeight]', () => {
    fc.assert(fc.property(fc.integer({ min: 200, max: 1400 }), fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 400, noNaN: true }), (h, frac, top) => {
      const r = keyboardInset(h, { height: h * frac, offsetTop: top })
      expect(Number.isInteger(r)).toBe(true)
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThanOrEqual(h)
    }))
  })
})

function makeEnv(innerHeight = 844) {
  const listeners: Record<string, (() => void)[]> = {}
  const vv = {
    height: innerHeight, offsetTop: 0,
    addEventListener: vi.fn((t: string, f: () => void) => { (listeners[t] ??= []).push(f) }),
    removeEventListener: vi.fn((t: string, f: () => void) => { listeners[t] = (listeners[t] ?? []).filter((x) => x !== f) }),
    dispatchEvent: () => true,
  }
  const frames: (() => void)[] = []
  const props: Record<string, string> = {}
  const dataset: DOMStringMap = {}
  const env = {
    window: { innerHeight, visualViewport: vv, requestAnimationFrame: (f: () => void) => frames.push(f), cancelAnimationFrame: vi.fn() },
    root: { style: { setProperty: (k: string, v: string) => { props[k] = v }, removeProperty: (k: string) => { delete props[k] } }, dataset },
  } as unknown as ViewportEnv
  const flush = () => { const f = frames.splice(0); f.forEach((x) => x()) }
  const fire = (t: string) => (listeners[t] ?? []).forEach((f) => f())
  return { env, vv, props, dataset, frames, flush, fire, listeners }
}

describe('installViewportVars', () => {
  it('starts with no keyboard: --kb 0, the full height, no data-keyboard', () => {
    const t = makeEnv()
    installViewportVars(t.env)
    expect(t.props).toEqual({ '--kb': '0px', '--vv-h': '844px' })
    expect(t.dataset.keyboard).toBeUndefined()
  })
  it('follows the keyboard opening and closing (resize), and scroll shifts', () => {
    const t = makeEnv()
    installViewportVars(t.env)
    t.vv.height = 508
    t.fire('resize'); t.flush()
    expect(t.props).toEqual({ '--kb': '336px', '--vv-h': '508px' })
    expect(t.dataset.keyboard).toBe('open')
    t.vv.offsetTop = 100
    t.fire('scroll'); t.flush()
    expect(t.props['--kb']).toBe('236px')
    t.vv.height = 844; t.vv.offsetTop = 0
    t.fire('resize'); t.flush()
    expect(t.props['--kb']).toBe('0px')
    expect(t.dataset.keyboard).toBeUndefined()
  })
  it('small changes (browser toolbars) are not a keyboard', () => {
    const t = makeEnv()
    installViewportVars(t.env)
    t.vv.height = 844 - (KEYBOARD_MIN - 1)
    t.fire('resize'); t.flush()
    expect(t.props['--kb']).toBe('0px')
    expect(t.dataset.keyboard).toBeUndefined()
  })
  it('writes at most once per frame however many events fire', () => {
    const t = makeEnv()
    installViewportVars(t.env)
    t.vv.height = 500
    for (let i = 0; i < 20; i++) t.fire(i % 2 ? 'resize' : 'scroll')
    expect(t.frames).toHaveLength(1)
    t.flush()
    expect(t.props['--kb']).toBe('344px')
  })
  it('does nothing where visualViewport does not exist', () => {
    const t = makeEnv()
    ;(t.env.window as { visualViewport?: unknown }).visualViewport = null
    const off = installViewportVars(t.env)
    expect(t.props).toEqual({})
    expect(() => off()).not.toThrow()
  })
  it('uninstalling stops listening, cancels a pending frame and removes everything it set', () => {
    const t = makeEnv()
    const off = installViewportVars(t.env)
    t.vv.height = 500
    t.fire('resize')
    off()
    expect(t.env.window.cancelAnimationFrame).toHaveBeenCalled()
    expect(t.props).toEqual({})
    expect(t.dataset.keyboard).toBeUndefined()
    expect(t.listeners.resize).toEqual([])
    expect(t.listeners.scroll).toEqual([])
  })
})
