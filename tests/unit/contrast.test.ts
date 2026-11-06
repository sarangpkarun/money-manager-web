import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { blend, checkTheme, contrast, hexToRgb, luminance, pairs, readVars } from '../../scripts/contrast.mjs'

const css = readFileSync(join(process.cwd(), 'src/app/theme.css'), 'utf8')

describe('contrast maths', () => {
  it('matches the WCAG reference values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
    expect(contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 2) // the well-known AA boundary grey
    expect(contrast('#777777', '#ffffff')).toBeLessThan(4.5)
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(contrast('#000000', '#ffffff'), 10) // order does not matter
  })
  it('luminance and parsing', () => {
    expect(luminance('#000000')).toBe(0)
    expect(luminance('#ffffff')).toBeCloseTo(1, 10)
    expect(hexToRgb('#0b0f14')).toEqual([11, 15, 20])
    expect(() => hexToRgb('red')).toThrow('not a #rrggbb colour')
    expect(() => hexToRgb('#fff')).toThrow()
  })
  it('blend paints a colour over another at an alpha', () => {
    expect(blend('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(blend('#ff0000', '#ffffff', 0)).toBe('#ffffff')
    expect(blend('#ff0000', '#ffffff', 1)).toBe('#ff0000')
  })
})

describe('theme.css', () => {
  it('both themes define every token the checker needs', () => {
    for (const sel of [':root', ":root[data-theme='dark']"]) {
      const v = readVars(css, sel)
      for (const k of ['bg', 'surface', 'surface-2', 'text', 'muted', 'accent', 'on-accent', 'toast-action', 'green', 'red', 'blue', 'amber', 'purple', 'grey']) expect(v[k], `${sel} --${k}`).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
  it('every text pair is at least 4.5:1 in light and dark', () => {
    expect(checkTheme(css)).toEqual([])
  })
  it('the checker does fail a bad theme, and names the pair', () => {
    const bad = css.replace('--on-accent: #0b0f14;', '--on-accent: #ffffff;')
    const f = checkTheme(bad)
    expect(f.length).toBeGreaterThan(0)
    expect(f[0]).toMatchObject({ theme: 'dark', name: expect.stringContaining('on-accent') })
    expect(f[0]!.ratio).toBeLessThan(4.5)
  })
  it('a missing token is reported by name', () => {
    expect(() => pairs({ bg: '#ffffff' })).toThrow('missing --text')
    expect(() => readVars(css, '.nope')).toThrow('no .nope block')
  })
})
