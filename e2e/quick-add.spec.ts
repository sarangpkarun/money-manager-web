import { expect, test } from '@playwright/test'
import { createUser, deleteUser, login, type E2EUser, tap } from './helpers'

let user: E2EUser
test.beforeAll(async () => { user = await createUser('qa') })
test.afterAll(async () => { await deleteUser(user.id) })

test('scenario E: + → 120 → Food → Save (3 taps) appears in Activity', async ({ page }) => {
  await login(page, user)

  let taps = 0
  const tap = async (locator: ReturnType<typeof page.getByRole>) => { await locator.click(); taps++ }

  await tap(page.getByRole('button', { name: 'Quick add' }))
  const amount = page.getByLabel('Amount')
  await expect(amount).toBeFocused() // keypad is ready without another tap
  await amount.pressSequentially('120')
  await tap(page.getByRole('button', { name: /Food/ }))
  await tap(page.getByRole('button', { name: 'Save' }))

  expect(taps).toBeLessThanOrEqual(4)
  await expect(page.getByRole('status')).toContainText('Added ₹120 · Food')

  await page.getByRole('link', { name: 'Activity' }).click()

  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible() // Home keeps its own rows mounted but hidden
  const row = page.getByRole('button', { name: /^Food.*open details/ })
  await expect(row).toBeVisible()
  await expect(row).toContainText('−₹120')
  await expect(page.getByText('Today')).toBeVisible()
  await expect(page.getByLabel('Totals')).toContainText('₹120')

  // and straight away on Home and in today's Calendar cell
  await page.getByRole('link', { name: 'Home' }).click()
  await expect(page.getByRole('region', { name: 'This month' }).getByLabel('Spent ₹120')).toBeVisible()
  await page.getByRole('link', { name: 'Calendar' }).click()
  await expect(page.getByRole('button', { name: /today.*spent ₹120/ })).toBeVisible()
})

test('Undo removes the transaction again', async ({ page }) => {
  await login(page, user)
  await page.getByRole('button', { name: 'Quick add' }).click()
  await page.getByLabel('Amount').pressSequentially('45+5')
  await expect(page.getByText('= ₹50')).toBeVisible()
  await page.getByRole('button', { name: /Groceries/ }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('link', { name: 'Activity' }).click()
  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible() // Home keeps its own rows mounted but hidden
  await expect(page.getByRole('button', { name: /^Groceries.*open details/ })).toBeVisible()

  await tap(page.getByRole('button', { name: /^Groceries.*open details/ }))
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('button', { name: /^Groceries.*open details/ })).toHaveCount(0)
  await page.getByRole('status').filter({ hasText: 'Deleted' }).getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('button', { name: /^Groceries.*open details/ })).toBeVisible()
})

test('a transfer to a credit card pays the bill and balances follow', async ({ page }) => {
  await login(page, user)
  // a card with money owed, via Settings → Accounts
  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByRole('link', { name: /Accounts/ }).click()
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill('HDFC Card')
  await dialog.getByLabel('Type').selectOption('credit_card')
  await dialog.getByLabel('Already owed on this card (₹)').fill('5000')
  await dialog.getByLabel('Credit limit (₹)').fill('20000')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('button', { name: /^Edit HDFC Card/ })).toContainText('Owed ₹5,000')

  await page.goto('/')
  await page.getByRole('button', { name: 'Quick add' }).click()
  await page.getByRole('radio', { name: 'Transfer' }).click()
  await page.getByLabel('Amount').pressSequentially('2000')
  await page.getByRole('group', { name: 'Destination account' }).getByRole('button', { name: /HDFC Card/ }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status')).toContainText('Added ₹2,000')

  await page.goto('/settings/accounts')
  await expect(page.getByRole('button', { name: /^Edit HDFC Card/ })).toContainText('Owed ₹3,000')
})
