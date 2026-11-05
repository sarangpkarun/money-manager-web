import { expect, test } from '@playwright/test'
import { createUser, deleteUser, login, type E2EUser } from './helpers'

let user: E2EUser
test.beforeEach(async () => { user = await createUser('dash') })
test.afterEach(async () => { await deleteUser(user.id) })

async function addExpense(page: import('@playwright/test').Page, amount: string, category: RegExp) {
  await page.getByRole('button', { name: 'Quick add' }).click()
  await page.getByLabel('Amount').pressSequentially(amount)
  await page.getByRole('button', { name: category }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status').filter({ hasText: `Added ₹${amount}` })).toBeVisible()
}

test('Home reflects new spending and drills into matching Activity totals', async ({ page }) => {
  await login(page, user)
  await expect(page.getByText(/^Nothing in /)).toBeVisible()

  await addExpense(page, '120', /Food/)
  await addExpense(page, '300', /Groceries/)

  const month = page.getByRole('region', { name: 'This month' })
  await expect(month.getByLabel('Spent ₹420')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Recent activity' })).toContainText('Groceries')

  const where = page.getByRole('region', { name: 'Where it went' })
  await expect(where).toContainText('Groceries')
  await where.getByRole('button', { name: /^Groceries, ₹300/ }).click()

  await expect(page).toHaveURL(/\/activity\?cat=/)
  await expect(page.getByLabel('Totals')).toContainText('₹300') // same number as the Home row
  await expect(page.getByRole('button', { name: 'Food, open details' })).toHaveCount(0)
})

test('cold open paints from the persisted cache with a single dashboard request', async ({ page }) => {
  await login(page, user)
  await addExpense(page, '75', /Food/)
  await expect(page.getByRole('region', { name: 'This month' }).getByLabel('Spent ₹75')).toBeVisible()
  await page.waitForTimeout(2500) // persister is throttled to 1 s

  let calls = 0
  await page.route('**/rest/v1/rpc/dashboard_summary', async (route) => {
    calls++
    await new Promise((r) => setTimeout(r, 4000)) // a slow network must not delay first paint
    await route.continue()
  })
  const t0 = Date.now()
  await page.reload()
  await expect(page.getByRole('region', { name: 'This month' }).getByLabel(/^Spent ₹/)).toBeVisible({ timeout: 3500 })
  console.log(`cached Home painted in ${Date.now() - t0} ms (network held for 4000 ms)`)
  await page.waitForTimeout(500)
  expect(calls).toBe(1)
})
