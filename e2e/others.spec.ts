import { expect, test, type Page } from '@playwright/test'
import { appToday, createUser, deleteUser, login, sql, type E2EUser } from './helpers'

let user: E2EUser
test.beforeEach(async () => { user = await createUser('oth') })
test.afterEach(async () => { await deleteUser(user.id) })

const bal = async (name: string, col: 'balance_paise' | 'outstanding_paise' = 'balance_paise') =>
  Number((await sql(`select ${col} v from account_balances where user_id = $1 and name = $2`, [user.id, name])).rows[0].v)

async function setupAccounts() {
  await sql(`insert into accounts (user_id, name, type, credit_limit_paise, due_day, sort) values ($1, 'HDFC Card', 'credit_card', 20000000, 22, 1), ($1, 'UPI', 'upi', 0, null, 2)`, [user.id])
}

async function addForOthers(page: Page, opts: { amount: string; account: string; title?: string; friends: { name: string; amount?: string }[] }) {
  await page.getByRole('button', { name: 'Quick add' }).click()
  const qa = page.getByRole('dialog')
  await qa.getByLabel('Amount').pressSequentially(opts.amount)
  if (opts.title) await qa.getByLabel('Title').fill(opts.title)
  await qa.getByRole('group', { name: 'Account' }).getByRole('button', { name: opts.account }).click()
  await qa.getByRole('button', { name: 'For someone else' }).click()
  const sec = qa.getByRole('region', { name: 'For someone else' })
  for (let i = 0; i < opts.friends.length; i++) {
    if (i > 0) await sec.getByRole('button', { name: '+ Add person' }).click()
    await sec.getByLabel(`Friend ${i + 1}`, { exact: true }).fill(opts.friends[i]!.name)
    const amt = opts.friends[i]!.amount
    if (amt) await sec.getByLabel(`Amount for friend ${i + 1}`, { exact: true }).fill(amt)
  }
  await qa.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Added' })).toBeVisible()
}

test('scenario A: ₹30,000 on the card for Arun: spend ₹0, card +₹30,000, ₹10,000 UPI, ₹20,000 cash settles', async ({ page }) => {
  await setupAccounts()
  await sql(`update accounts set opening_balance_paise = 5000000 where user_id = $1 and name = 'Cash'`, [user.id])
  await login(page, user)

  await addForOthers(page, { amount: '30000', account: 'HDFC Card', title: 'Dinner', friends: [{ name: 'Arun' }] })
  await expect.poll(() => bal('HDFC Card', 'outstanding_paise')).toBe(3_000_000) // the card carries the whole bill

  // Home: personal spend did not move; the Cards card shows the friend and the bill date
  await expect(page.getByRole('region', { name: 'This month' }).getByLabel('Spent ₹0')).toBeVisible()
  const cards = page.getByRole('region', { name: 'Credit cards' })
  await expect(cards).toContainText('₹30,000 to get back from friends')
  await expect(cards).toContainText('₹30,000 of this is for friends')
  await expect(cards).toContainText('Bill due')

  // Activity: the badge, the gross amount, and the day total counts your share (₹0)
  await page.getByRole('link', { name: 'Activity' }).click()
  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible()
  const row = page.getByRole('button', { name: 'Dinner, open details' }).filter({ hasText: '₹30,000' })
  await expect(row).toContainText('₹30,000 pending from Arun')
  await expect(page.getByLabel('Totals')).toContainText('₹0') // spent

  // Money: Arun owes ₹30,000 ("Paid for")
  await page.getByRole('link', { name: 'Money' }).click()
  await expect(page.getByRole('region', { name: 'Arun' })).toContainText('Paid for')
  await expect(page.getByRole('region', { name: 'Summary' })).toContainText('₹30,000')

  // Arun pays ₹10,000 by UPI
  await page.getByRole('button', { name: /^Dinner, Arun, pending/ }).click()
  await expect(page.getByRole('region', { name: 'Linked purchase' })).toContainText('your share ₹0')
  await page.getByRole('button', { name: 'Receive money' }).click()
  let pay = page.getByRole('dialog')
  await pay.getByLabel('Amount').fill('10000')
  await pay.getByRole('group', { name: 'Received into' }).getByRole('button', { name: 'UPI' }).click()
  await pay.getByRole('button', { name: 'Receive', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Progress' })).toContainText('Partial')
  expect(await bal('UPI')).toBe(1_000_000)
  expect(await bal('HDFC Card', 'outstanding_paise')).toBe(3_000_000) // the bill is settled separately

  // and ₹20,000 in cash settles it
  await page.getByRole('button', { name: 'Receive money' }).click()
  pay = page.getByRole('dialog')
  await expect(pay.getByLabel('Amount')).toHaveValue('20000')
  await pay.getByRole('group', { name: 'Received into' }).getByRole('button', { name: 'Cash' }).click()
  await pay.getByRole('button', { name: 'Receive', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Progress' })).toContainText('Paid')
  expect(await bal('Cash')).toBe(7_000_000)

  // the badge is gone from Activity and the entry sits in History
  await page.getByRole('link', { name: '‹ Money' }).click()
  await page.getByRole('tab', { name: 'History' }).click()
  await expect(page.getByRole('button', { name: /^Dinner, Arun, settled/ })).toBeVisible()
  await page.getByRole('link', { name: 'Activity' }).click()
  await expect(page.getByRole('button', { name: 'Dinner, open details' }).filter({ hasText: '₹30,000' })).not.toContainText('pending from') // the two repayments share its title
  // spending never moved through any of it
  await expect(page.getByLabel('Totals')).toContainText('₹0')
})

test('partial: ₹5,000 bill with ₹4,000 for a friend adds ₹1,000 to your spend; a three-way split reconciles', async ({ page }) => {
  await login(page, user)
  await addForOthers(page, { amount: '5000', account: 'Cash', title: 'Bill', friends: [{ name: 'Ravi', amount: '4000' }] })
  await expect(page.getByRole('region', { name: 'This month' }).getByLabel('Spent ₹1,000')).toBeVisible()

  await addForOthers(page, { amount: '900', account: 'Cash', title: 'Trip', friends: [{ name: 'Asha' }, { name: 'Meera' }, { name: 'Kabir' }] })
  // ₹900 split three ways: all of it was for friends, so spend is still ₹1,000
  await expect(page.getByRole('region', { name: 'This month' }).getByLabel('Spent ₹1,000')).toBeVisible()
  await expect.poll(async () => (await sql(`select for_other_paise f, amount_paise a from transactions where user_id = $1 and title = 'Trip'`, [user.id])).rows[0]?.f).toBe('90000')
  const t = (await sql(`select for_other_paise f, amount_paise a from transactions where user_id = $1 and title = 'Trip'`, [user.id])).rows[0]
  expect(Number(t.f)).toBe(Number(t.a))
  const es = (await sql(`select principal_paise p from entries where user_id = $1 and source_txn_id = (select id from transactions where user_id = $1 and title = 'Trip')`, [user.id])).rows
  expect(es).toHaveLength(3)
  expect(es.reduce((s, r) => s + Number(r.p), 0)).toBe(90_000)
})

test('deleting the purchase is blocked once a friend has paid, then works (with Undo) after the payment is removed', async ({ page }) => {
  const today = await appToday(user.id)
  void today
  await login(page, user)
  await addForOthers(page, { amount: '1000', account: 'Cash', title: 'Lunch', friends: [{ name: 'Arun' }] })

  // Arun pays ₹250
  await page.getByRole('link', { name: 'Money' }).click()
  await page.getByRole('button', { name: /^Lunch, Arun, pending/ }).click()
  await page.getByRole('button', { name: 'Receive money' }).click()
  await page.getByRole('dialog').getByLabel('Amount').fill('250')
  await page.getByRole('dialog').getByRole('button', { name: 'Receive', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Progress' })).toContainText('Partial')
  await page.getByRole('link', { name: '‹ Money' }).click()

  // delete from Activity: blocked with an explanation, nothing changes
  await page.getByRole('link', { name: 'Activity' }).click()
  const purchase = page.getByRole('button', { name: 'Lunch, open details' }).filter({ hasText: '₹1,000' }) // the ₹250 repayment has the same title
  await purchase.click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('status').filter({ hasText: /Arun has already paid ₹250\. Delete those payments first\./ })).toBeVisible()
  await expect(purchase).toBeVisible()

  // remove the payment from the entry, then delete the purchase
  await purchase.click()
  await page.getByRole('dialog').getByRole('button', { name: 'Open entry for Arun' }).click()
  await page.getByRole('button', { name: /^Delete payment of/ }).click()
  await expect(page.getByRole('region', { name: 'Progress' })).toContainText('Pending')
  await page.getByRole('link', { name: '‹ Money' }).click()
  await page.getByRole('link', { name: 'Activity' }).click()
  await purchase.click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await expect(purchase).toHaveCount(0)
  expect(Number((await sql(`select count(*)::int n from entries where user_id = $1`, [user.id])).rows[0].n)).toBe(0)

  // Undo brings back the purchase with its friend
  await page.getByRole('status').filter({ hasText: /Deleted ₹1,000/ }).getByRole('button', { name: 'Undo' }).click()
  await expect(purchase).toContainText('pending from Arun')
  expect(Number((await sql(`select count(*)::int n from entries where user_id = $1 and kind = 'on_behalf'`, [user.id])).rows[0].n)).toBe(1)
})

test('the "not returned yet" filter lists only purchases a friend still owes on', async ({ page }) => {
  await login(page, user)
  await addForOthers(page, { amount: '500', account: 'Cash', title: 'PendingBill', friends: [{ name: 'Arun' }] })
  await page.getByRole('button', { name: 'Quick add' }).click()
  await page.getByRole('dialog').getByLabel('Amount').pressSequentially('50')
  await page.getByRole('dialog').getByLabel('Title').fill('PlainTea')
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status').filter({ hasText: /Added ₹50(?!\d)/ })).toBeVisible()

  await page.getByRole('link', { name: 'Activity' }).click()
  await expect(page.getByRole('button', { name: 'PlainTea, open details' })).toBeVisible()
  await page.getByRole('button', { name: 'Filters' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Paid for others, not returned yet' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Apply' }).click()
  await expect(page).toHaveURL(/others=pending/)
  await expect(page.getByRole('button', { name: 'PendingBill, open details' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'PlainTea, open details' })).toHaveCount(0)
})
