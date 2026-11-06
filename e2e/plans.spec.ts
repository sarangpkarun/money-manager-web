import { expect, test, type Page } from '@playwright/test'
import { appToday, createUser, deleteUser, login, shiftDate, sql, tap, type E2EUser } from './helpers'

let user: E2EUser
test.beforeEach(async () => { user = await createUser('plans') })
test.afterEach(async () => { await deleteUser(user.id) })

const balance = async (name: string) =>
  Number((await sql(`select balance_paise from account_balances where user_id = $1 and name = $2`, [user.id, name])).rows[0].balance_paise)

async function openEntry(page: Page, tab: 'Owed to me' | 'I owe', name: RegExp) {
  await page.getByRole('link', { name: 'Money' }).click()
  await expect(page.getByRole('heading', { name: 'Money' })).toBeVisible()
  await page.getByRole('tab', { name: tab }).click()
  await tap(page.getByRole('button', { name }))
  await expect(page.getByRole('region', { name: 'Instalments' })).toBeVisible()
}

test('scenario B: borrow ₹50,000 in 10 instalments, #2 paid early', async ({ page }) => {
  const today = await appToday(user.id)
  const first = shiftDate(today, 2)
  await login(page, user)

  await page.getByRole('button', { name: 'Quick add' }).click()
  await page.getByRole('radio', { name: 'Borrowed' }).click()
  await page.getByLabel('Amount').pressSequentially('50000')
  await page.getByLabel('Person').fill('Ravi')
  await page.getByRole('button', { name: 'Repay in instalments' }).click()
  await page.getByLabel('Number of months').fill('10')
  await page.getByLabel('First instalment').fill(first)
  await expect(page.getByRole('region', { name: 'Plan preview' })).toContainText('10 × ₹5,000')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'in 10 instalments' })).toBeVisible()
  expect(await balance('Cash')).toBe(5_000_000) // borrowed money arrives

  await openEntry(page, 'I owe', /^Borrowed from Ravi/)
  const list = page.getByRole('region', { name: 'Instalments' })
  await expect(list).toContainText('0 of 10 paid')
  await expect(list.getByRole('listitem')).toHaveCount(10)

  // pay #2 first, today: early
  await page.getByRole('button', { name: 'Pay instalment 2' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('Amount')).toHaveValue('5000')
  await dialog.getByRole('button', { name: 'Pay', exact: true }).click()
  await expect(list).toContainText('1 of 10 paid')
  await expect(list.getByRole('listitem').nth(1)).toContainText(/Paid early \(\d+ days\)/)
  await expect(list.getByRole('listitem').nth(0)).not.toContainText('Paid')
  expect(await balance('Cash')).toBe(5_000_000 - 500_000)

  // Home: Due soon shows #1 (due in 2 days) once, and no more rows of this plan
  await page.getByRole('link', { name: '‹ Money' }).click()
  await page.getByRole('link', { name: 'Home' }).click()
  const due = page.getByRole('region', { name: 'Due soon' })
  await expect(due).toContainText('Borrowed from Ravi')
  await expect(due.getByRole('listitem')).toHaveCount(1)
  await expect(page.getByRole('region', { name: 'EMI & loan load' })).toContainText('₹45,000')
})

test('scenario C: ₹60,000 EMI, ₹6,000 down, 9 months, no-cost', async ({ page }) => {
  const today = await appToday(user.id)
  await login(page, user)

  await page.getByRole('button', { name: 'Quick add' }).click()
  await page.getByRole('button', { name: /EMI \/ instalments/ }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('What did you buy?').fill('Phone')
  await sheet.getByLabel('Store or lender').fill('Croma')
  await sheet.getByLabel('Price (₹)').fill('60000')
  await sheet.getByLabel('Down payment (₹)').fill('6000')
  await sheet.getByLabel('Months').fill('9')
  await sheet.getByLabel('First instalment').fill(shiftDate(today, 20))
  const preview = sheet.getByRole('region', { name: 'Plan preview' })
  await expect(preview).toContainText('9 × ₹6,000')
  await expect(preview).toContainText('interest ₹0')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Phone: 9 × ₹6,000' })).toBeVisible()
  expect(await balance('Cash')).toBe(-600_000) // only the down payment has left the account

  await openEntry(page, 'I owe', /^Phone/)
  const list = page.getByRole('region', { name: 'Instalments' })
  await expect(list.getByRole('listitem')).toHaveCount(9)
  await expect(page.getByText('No-cost EMI (no interest)')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Progress' })).toContainText('₹54,000')

  // the first instalment is an expense in the account, not a loan repayment
  await page.getByRole('button', { name: 'Pay instalment 1' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Pay', exact: true }).click()
  await expect(list).toContainText('1 of 9 paid')
  expect(await balance('Cash')).toBe(-1_200_000)
  const kinds = (await sql(`select t.kind from transactions t join entries e on e.id = t.entry_id where e.user_id = $1 order by t.created_at`, [user.id])).rows.map((r) => r.kind)
  expect(kinds).toEqual(['expense', 'expense'])

  // linked transactions are read-only in Activity
  await page.getByRole('link', { name: '‹ Money' }).click()
  await page.getByRole('link', { name: 'Activity' }).click()
  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible()
  await page.getByRole('button', { name: /^Phone.*open details/ }).first().click()
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Delete' })).toHaveCount(0)
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Open entry' })).toBeVisible()
})

test('scenario D: lend ₹2,000 weekly 4 × ₹500, pay row 3 first, two days late', async ({ page }) => {
  const today = await appToday(user.id)
  const first = shiftDate(today, -16) // row 3 is due 14 days later = 2 days ago
  await login(page, user)

  await page.getByRole('button', { name: 'Quick add' }).click()
  await page.getByRole('radio', { name: 'Lent' }).click()
  await page.getByLabel('Amount').pressSequentially('2000')
  await page.getByLabel('Person').fill('Asha')
  await page.getByLabel('Date', { exact: true }).fill(first)
  await page.getByRole('button', { name: 'Repay in instalments' }).click()
  await page.getByRole('button', { name: 'Weekly' }).click()
  await page.getByLabel('Number of weeks').fill('4')
  await page.getByLabel('First week').fill(first)
  await expect(page.getByRole('region', { name: 'Plan preview' })).toContainText('4 × ₹500')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'in 4 instalments' })).toBeVisible()

  await openEntry(page, 'Owed to me', /^Lent to Asha/)
  const list = page.getByRole('region', { name: 'Instalments' })
  await expect(list.getByRole('listitem').nth(0)).toContainText('Overdue')
  await page.getByRole('button', { name: 'Pay instalment 3' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Receive', exact: true }).click()
  await expect(list.getByRole('listitem').nth(2)).toContainText('Paid late (2 days)')
  await expect(list.getByRole('listitem').filter({ hasText: /^#\d.*Paid/ })).toHaveCount(1) // exactly one paid row
  await expect(list).toContainText('1 of 4 paid')
})

test('skip month and extra payment change the plan and are recorded', async ({ page }) => {
  const today = await appToday(user.id)
  await sql(`update accounts set opening_balance_paise = 1000000 where user_id = $1 and name = 'Cash'`, [user.id])
  await login(page, user)
  await page.getByRole('button', { name: 'Quick add' }).click()
  await page.getByRole('radio', { name: 'Borrowed' }).click()
  await page.getByLabel('Amount').pressSequentially('4000')
  await page.getByLabel('Person').fill('Meera')
  await page.getByRole('button', { name: 'Repay in instalments' }).click()
  await page.getByLabel('Number of months').fill('4')
  await page.getByLabel('First instalment').fill(shiftDate(today, 10))
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'in 4 instalments' })).toBeVisible()

  await openEntry(page, 'I owe', /^Borrowed from Meera/)
  const list = page.getByRole('region', { name: 'Instalments' })
  const lastBefore = (await list.getByRole('listitem').last().textContent()) ?? ''

  await page.getByRole('button', { name: 'Skip month from instalment 4' }).click()
  const skip = page.getByRole('dialog')
  await expect(skip.getByRole('region', { name: 'What will change' })).toContainText('#4 moves')
  await skip.getByRole('button', { name: 'Skip month' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(list.getByRole('listitem').last()).not.toHaveText(lastBefore)

  // extra ₹1,500 comes off the end: #4 disappears, #3 shrinks to ₹500
  await page.getByRole('button', { name: 'Extra payment' }).click()
  const extra = page.getByRole('dialog')
  await extra.getByLabel('Extra amount').fill('1500')
  await expect(extra.getByRole('region', { name: 'What will change' })).toContainText('removed')
  await extra.getByRole('button', { name: 'Record extra payment' }).click()
  await expect(list.getByRole('listitem')).toHaveCount(3)
  await expect(page.getByRole('region', { name: 'Payments' })).toContainText('extra payment')
  await expect(page.getByRole('button', { name: /Delete payment/ })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Progress' })).toContainText('₹2,500')
  const total = Number((await sql(`select sum(due_paise - paid_paise) s from schedule_items where user_id = $1`, [user.id])).rows[0].s)
  expect(total).toBe(250_000)
})
