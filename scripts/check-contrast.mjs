// Fails when a text/background pair in src/app/theme.css is below WCAG AA (4.5:1), in either theme.
import { readFileSync } from 'node:fs'
import { checkTheme } from './contrast.mjs'

const css = readFileSync(new URL('../src/app/theme.css', import.meta.url), 'utf8')
const failures = checkTheme(css)
if (failures.length) {
  for (const f of failures) console.error(`✗ ${f.theme}: ${f.name} = ${f.ratio.toFixed(2)} (needs ${f.min})`)
  console.error(`\n${failures.length} contrast failure(s)`)
  process.exit(1)
}
console.log('contrast: every text pair is at least 4.5:1 in light and dark')
