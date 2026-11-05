import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, resolveTheme, useTheme } from '@/lib/theme'

describe('theme', () => {
  beforeEach(() => {
    document.head.innerHTML = '<meta name="theme-color" content="#000">'
    document.documentElement.removeAttribute('data-theme')
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('dark'), addEventListener() {} }))
  })

  it('resolves system preference', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
  })

  it('applies data-theme and theme-color meta', () => {
    applyTheme('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#f2f3f7')
    applyTheme('system') // matchMedia stub reports dark
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('setPref persists and applies', () => {
    useTheme.getState().setPref('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
