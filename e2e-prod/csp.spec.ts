/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'
import { createUser, deleteUser, login, type E2EUser } from '../e2e/helpers'

let user: E2EUser
test.beforeEach(async () => { user = await createUser('csp') })
test.afterEach(async () => { await deleteUser(user.id) })

/** Collects every CSP violation the browser reports, plus console errors and uncaught exceptions. */
async function watch(page: Page) {
  const problems: string[] = []
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(`CSP-VIOLATION ${e.violatedDirective} blocked ${e.blockedURI || 'inline'} (${e.sourceFile ?? ''}:${e.lineNumber})`)
    })
  })
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) problems.push(`console: ${m.text()}`) })
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  return problems
}

test('the production build sends the security headers and runs every main screen without a policy violation', async ({ page }) => {
  const problems = await watch(page)
  const first = await page.goto('/')
  const h = first!.headers()
  expect(h['content-security-policy']).toContain("default-src 'self'")
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(h['content-security-policy']).not.toContain("'unsafe-eval'")
  expect(h['content-security-policy']).not.toMatch(/script-src[^;]*'unsafe-inline'/)
  expect(h['strict-transport-security']).toMatch(/max-age=\d{7,}/)
  expect(h['x-content-type-options']).toBe('nosniff')
  expect(h['referrer-policy']).toBe('no-referrer')
  expect(h['permissions-policy']).toContain('camera=()')
  expect(h['x-frame-options']).toBe('DENY')
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible()

  await login(page, user)
  await expect(page.getByText(/^Nothing in /)).toBeVisible()

  // a write, so Supabase REST/auth traffic runs under the policy
  await page.getByRole('button', { name: 'Quick add' }).click()
  await page.getByLabel('Amount').pressSequentially('120')
  await page.getByRole('button', { name: /Food/ }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Added ₹120' })).toBeVisible()

  for (const tab of ['Activity', 'Money', 'Calendar', 'Home']) {
    await page.getByRole('link', { name: tab, exact: true }).click()
    await expect(page.getByRole('heading', { name: tab === 'Home' ? /^Hello/ : tab })).toBeVisible()
  }

  for (const [path, heading] of [['/settings/profile', 'Profile'], ['/settings/display', 'Display'], ['/settings/reminders', 'Reminders'], ['/settings/accounts', 'Accounts'], ['/settings/export', 'Export'], ['/settings/about', 'About']] as const) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
  }

  // export builds a file from a blob: URL
  await page.goto('/settings/export')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export transactions' }).click()])
  expect(download.suggestedFilename()).toMatch(/\.csv$/)

  // the service worker registers and takes control (worker-src)
  const sw = await page.evaluate(async () => !!(await navigator.serviceWorker.ready).active)
  expect(sw).toBe(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Export', exact: true })).toBeVisible()

  expect(problems).toEqual([])
})

test('the app cannot be framed', async ({ page }) => {
  await page.goto('/')
  const framed = await page.evaluate(async () => {
    const f = document.createElement('iframe')
    f.src = location.origin + '/'
    document.body.appendChild(f)
    await new Promise((r) => setTimeout(r, 1500))
    try { return !!f.contentDocument?.body?.innerHTML } catch { return false }
  })
  expect(framed).toBe(false)
})
