import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** All non-test source files under src (ts, tsx, css). */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return sources(p)
    return /\.(tsx?|css)$/.test(name) && !/\.test\./.test(name) ? [p] : []
  })
}

const files = sources(join(process.cwd(), 'src')).map((p) => ({ p, text: readFileSync(p, 'utf8') }))

describe('animation budget: only transform, opacity and colour may animate (no layout properties)', () => {
  it('finds the sources', () => expect(files.length).toBeGreaterThan(50))

  it('Tailwind transitions are limited to transform, colors and opacity', () => {
    const bad = files.filter((f) => !f.p.endsWith('.css')).flatMap(({ p, text }) => [...text.matchAll(/\btransition-([a-z[][^\s"'`:]*)/g)].map((m) => ({ p, cls: m[0] }))).filter(({ cls }) => !/^transition-(transform|colors|opacity)$/.test(cls))
    expect(bad).toEqual([])
  })

  it('inline and CSS transitions never name a layout property', () => {
    const layout = /\b(width|height|top|left|right|bottom|margin|padding|font-size|border-width|all)\b/
    const bad = files.filter((f) => !f.p.endsWith('.css')).flatMap(({ p, text }) => [...text.matchAll(/transition(?:-property)?\s*:\s*([^;}\n]+)/g)].map((m) => ({ p, value: m[1]! }))).filter(({ value }) => layout.test(value))
    expect(bad).toEqual([])
  })

  it('animation classes are the opacity pulse only; no keyframes that move layout', () => {
    const classes = files.flatMap(({ p, text }) => [...text.matchAll(/\banimate-([a-z-]+)/g)].map((m) => ({ p, name: m[1] })))
    expect(classes.filter((c) => c.name !== 'pulse')).toEqual([])
    const keyframes = files.flatMap(({ p, text }) => [...text.matchAll(/@keyframes[\s\S]*?\n\}/g)].map((m) => ({ p, css: m[0] })))
    expect(keyframes.filter(({ css }) => /\b(width|height|top|left|margin|padding)\s*:/.test(css))).toEqual([])
  })

  it('theme.css switches animations and transitions off for people who ask for reduced motion', () => {
    const css = files.find((f) => f.p.endsWith('theme.css'))!.text
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-duration: 0\.01ms !important[\s\S]*transition-duration: 0\.01ms !important/)
  })
})
