// WCAG contrast maths and the theme check used by `pnpm check:contrast` (and its unit test).

/** "#rrggbb" -> [r, g, b] (0..255) */
export const hexToRgb = (hex) => {
  const h = hex.trim().replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`not a #rrggbb colour: ${hex}`)
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}

const channel = (v) => {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export const luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio, 1..21 */
export const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** `fg` painted at `alpha` (0..1) over `bg`, as a solid colour */
export const blend = (fg, bg, alpha) => {
  const f = hexToRgb(fg)
  const b = hexToRgb(bg)
  return '#' + f.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('')
}

/** Custom properties declared inside the first `selector { ... }` block of the CSS text. */
export function readVars(css, selector) {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`no ${selector} block`)
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
  return Object.fromEntries([...body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
}

export const MIN_TEXT = 4.5
const TEXT_ON = ['bg', 'surface', 'surface-2']
const TEXTS = ['text', 'muted', 'accent', 'green', 'red', 'blue', 'amber', 'purple', 'grey']
/** tinted badges (`bg-money-X/15 text-money-X`, TONE_CLS) on a row or the page, and the amber notice in a card (`/10`) */
const TINTED = [['green', 0.15, ['surface', 'bg']], ['blue', 0.15, ['surface', 'bg']], ['amber', 0.15, ['surface', 'bg']], ['red', 0.15, ['surface', 'bg']], ['amber', 0.1, ['surface']]]

/** Every text/background pair the app uses, for one theme's variables. Returns [{ name, ratio, min }] */
export function pairs(raw) {
  const v = new Proxy(raw, { get: (t, k) => { if (!(k in t)) throw new Error(`theme.css is missing --${String(k)}`); return t[k] } })
  const out = []
  for (const fg of TEXTS) for (const bg of TEXT_ON) out.push({ name: `${fg} on ${bg}`, ratio: contrast(v[fg], v[bg]), min: MIN_TEXT })
  out.push({ name: 'on-accent on accent (buttons)', ratio: contrast(v['on-accent'], v.accent), min: MIN_TEXT })
  out.push({ name: 'on-accent on red (delete buttons, badges)', ratio: contrast(v['on-accent'], v.red), min: MIN_TEXT })
  out.push({ name: 'bg on text (toast)', ratio: contrast(v.bg, v.text), min: MIN_TEXT })
  out.push({ name: 'toast-action on text (toast button)', ratio: contrast(v['toast-action'], v.text), min: MIN_TEXT })
  for (const [name, alpha, bases] of TINTED) for (const base of bases) {
    out.push({ name: `${name} text on ${name}/${alpha * 100}% over ${base}`, ratio: contrast(v[name], blend(v[name], v[base], alpha)), min: MIN_TEXT })
  }
  return out
}

/** Failing pairs for both themes of a theme.css text. */
export function checkTheme(css) {
  const light = readVars(css, ':root')
  const dark = readVars(css, ":root[data-theme='dark']")
  const failures = []
  for (const [theme, vars] of [['light', light], ['dark', dark]]) {
    for (const p of pairs(vars)) if (p.ratio < p.min) failures.push({ theme, ...p })
  }
  return failures
}
