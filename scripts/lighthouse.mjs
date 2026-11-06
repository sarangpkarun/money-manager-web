// Lighthouse on the production build, signed in, with the mobile profile (4x CPU slowdown, slow-4G network).
// Local only: needs `supabase start` and `pnpm build`. Usage: node scripts/lighthouse.mjs [--no-seed]
// Starts `vite preview` and a Chromium with a debugging port, logs in as perf@test.local (seeded with 5,000 transactions)
// so that Lighthouse measures Home (not the sign-in page), then prints the scores. Reports are written to lighthouse-report/.
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import lighthouse from 'lighthouse'
import { chromium } from '@playwright/test'

const PORT = 4173
const DEBUG_PORT = 9222
const BASE = `http://localhost:${PORT}`
const EMAIL = 'perf@test.local'
const PASSWORD = 'Passw0rd!perf'

if (!process.argv.includes('--no-seed')) execFileSync('node', ['scripts/seed-transactions.mjs', EMAIL], { stdio: 'inherit' })

const preview = spawn('pnpm', ['exec', 'vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
const stop = () => preview.kill()
process.on('exit', stop)

async function waitFor(url, ms = 20_000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try { if ((await fetch(url)).ok) return } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`${url} did not come up (run pnpm build first)`)
}

try {
  await waitFor(BASE)
  // a persistent (default) context, so that the tab Lighthouse attaches to is the signed-in one
  const browser = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'lh-')), { args: [`--remote-debugging-port=${DEBUG_PORT}`] })
  const page = browser.pages()[0] ?? await browser.newPage()
  await page.goto(BASE)
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.getByRole('region', { name: 'This month' }).waitFor()
  await page.waitForTimeout(3000) // let the service worker install and the persisted cache write

  const pwa = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker?.getRegistration()
    const m = await (await fetch(document.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? '/manifest.webmanifest')).json()
    return {
      serviceWorker: !!reg?.active,
      manifest: { name: m.name, short_name: m.short_name, display: m.display, start_url: m.start_url, theme_color: m.theme_color, icons: (m.icons ?? []).map((i) => i.sizes) },
      appleTouchIcon: !!document.querySelector('link[rel="apple-touch-icon"]'),
      viewport: !!document.querySelector('meta[name="viewport"]'),
      themeColorMeta: !!document.querySelector('meta[name="theme-color"]'),
    }
  })

  const result = await lighthouse(`${BASE}/`, {
    port: DEBUG_PORT, output: ['json', 'html'], logLevel: 'error', formFactor: 'mobile',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
  }, { extends: 'lighthouse:default', settings: { disableStorageReset: true } })

  const lhr = result.lhr
  mkdirSync('lighthouse-report', { recursive: true })
  writeFileSync('lighthouse-report/report.json', result.report[0])
  writeFileSync('lighthouse-report/report.html', result.report[1])
  const score = (k) => Math.round((lhr.categories[k]?.score ?? 0) * 100)
  const audit = (k) => lhr.audits[k]?.displayValue ?? 'n/a'
  console.log(`\nLighthouse ${lhr.lighthouseVersion}, mobile, ${lhr.finalDisplayedUrl}`)
  console.log(`  Performance ${score('performance')}   Accessibility ${score('accessibility')}   Best practices ${score('best-practices')}   SEO ${score('seo')}`)
  console.log(`  FCP ${audit('first-contentful-paint')}  LCP ${audit('largest-contentful-paint')}  TBT ${audit('total-blocking-time')}  CLS ${audit('cumulative-layout-shift')}  Speed Index ${audit('speed-index')}`)
  console.log('  PWA checks:', JSON.stringify(pwa))
  const failing = Object.values(lhr.audits).filter((a) => a.score !== null && a.score < 0.9 && a.scoreDisplayMode !== 'informative' && a.scoreDisplayMode !== 'notApplicable')
  if (failing.length) console.log('  Audits under 90:\n' + failing.map((a) => `    - ${a.id} (${Math.round(a.score * 100)}): ${a.title}${a.displayValue ? ` [${a.displayValue}]` : ''}`).join('\n'))
  await browser.close()
} finally {
  stop()
}
