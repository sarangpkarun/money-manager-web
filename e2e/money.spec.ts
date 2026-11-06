import { expect, test, type Page } from '@playwright/test'
import { createUser, deleteUser, login, sql, type E2EUser, tap } from './helpers'

let user: E2EUser
test.beforeEach(async () => { user = await createUser('money') })
test.afterEach(async () => { await deleteUser(user.id) })

const cashBalance = async () =>
  Number((await sql(`select balance_paise from account_balances where user_id = $1 and name = 'Cash'`, [user.id])).rows[0].balance_paise)

async function lend(page: Page, person: string, amount: string) {
  await page.getByRole('button', { name: 'Quick add' }).click()
  await page.getByRole('radio', { name: 'Lent' }).click()
  await page.getByLabel('Amount').pressSequentially(amount)
  await page.getByLabel('Person').fill(person)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status').filter({ hasText: `Lent` })).toBeVisible()
}

test('lend ₹10,000 → part pay ₹4,000 → settle ₹6,000: statuses, history and balances follow', async ({ page }) => {
  // opening balance so the account can lend
  await sql(`update accounts set opening_balance_paise = 5000000 where user_id = $1 and name = 'Cash'`, [user.id])
  await login(page, user)

  await lend(page, 'Ravi', '10000')
  expect(await cashBalance()).toBe(4_000_000) // 50,000 − 10,000

  await page.getByRole('link', { name: 'Money' }).click()
  await expect(page.getByRole('heading', { name: 'Money' })).toBeVisible()
  const ravi = page.getByRole('region', { name: 'Ravi' })
  await expect(ravi).toContainText('Lent to Ravi')
  await expect(ravi).toContainText('Pending')
  await expect(page.getByRole('region', { name: 'Summary' })).toContainText('₹10,000')

  // part payment
  await tap(page.getByRole('button', { name: /^Lent to Ravi/ }))
  await expect(page.getByRole('region', { name: 'Progress' })).toContainText('₹10,000')
  await page.getByRole('button', { name: 'Receive money' }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('Amount').fill('4000')
  await sheet.getByRole('button', { name: 'Receive', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Progress' })).toContainText('Partial')
  await expect(page.getByRole('region', { name: 'Progress' })).toContainText('₹6,000')
  expect(await cashBalance()).toBe(4_400_000)

  // overpayment is refused and changes nothing
  await page.getByRole('button', { name: 'Receive money' }).click()
  await sheet.getByLabel('Amount').fill('6001')
  await sheet.getByRole('button', { name: 'Receive', exact: true }).click()
  await expect(sheet.getByText('That is more than the ₹6,000 left')).toBeVisible()
  expect(await cashBalance()).toBe(4_400_000)
  await sheet.getByLabel('Amount').fill('6000')
  await sheet.getByRole('button', { name: 'Receive', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Progress' })).toContainText('Paid')
  await expect(page.getByRole('button', { name: 'Receive money' })).toHaveCount(0)
  expect(await cashBalance()).toBe(5_000_000)

  // settled: gone from Owed to me, present in History
  await page.getByRole('link', { name: '‹ Money' }).click()
  await expect(page.getByRole('heading', { name: 'Money' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Ravi' })).toHaveCount(0)
  await page.getByRole('tab', { name: 'History' }).click()
  await expect(page.getByRole('button', { name: /^Lent to Ravi/ })).toBeVisible()

  // loans never count as spending
  await page.getByRole('link', { name: 'Activity' }).click()
  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible()
  await expect(page.getByLabel('Totals')).toContainText('₹0')
})

test('deleting a payment reverses it; the entry reopens and the balance returns', async ({ page }) => {
  await sql(`update accounts set opening_balance_paise = 100000 where user_id = $1 and name = 'Cash'`, [user.id])
  await login(page, user)
  await lend(page, 'Meera', '500')
  await page.getByRole('link', { name: 'Money' }).click()
  await expect(page.getByRole('heading', { name: 'Money' })).toBeVisible() // the Home tab stays mounted for a moment: wait for the switch
  await tap(page.getByRole('button', { name: /^Lent to Meera/ }))
  await page.getByRole('button', { name: 'Receive money' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Receive', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Progress' })).toContainText('Paid')
  expect(await cashBalance()).toBe(100_000)

  await tap(page.getByRole('button', { name: /^Delete payment of/ }))
  await expect(page.getByRole('region', { name: 'Progress' })).toContainText('Pending')
  expect(await cashBalance()).toBe(50_000)

  // Undo puts the payment back
  await page.getByRole('status').filter({ hasText: 'deleted' }).getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('region', { name: 'Progress' })).toContainText('Paid')
  expect(await cashBalance()).toBe(100_000)
})

test('a loan transaction in Activity points at the loan instead of offering Delete', async ({ page }) => {
  await login(page, user)
  await lend(page, 'Asha', '250')
  await page.getByRole('link', { name: 'Activity' }).click()
  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible()
  await tap(page.getByRole('button', { name: /^Lent to Asha.*open details/ }))
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Delete' })).toHaveCount(0)
  await page.getByRole('dialog').getByRole('button', { name: 'Open entry' }).click()
  await expect(page).toHaveURL(/\/money\/entry\//)
  await expect(page.getByRole('region', { name: 'Progress' })).toContainText('₹250')
})
