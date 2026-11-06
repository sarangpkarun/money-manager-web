import { expect, test } from '@playwright/test'
import { appToday, createUser, deleteUser, login, shiftDate, sql, type E2EUser } from './helpers'

let user: E2EUser
test.beforeEach(async () => { user = await createUser('ins') })
test.afterEach(async () => { await deleteUser(user.id) })

test('a new account has no Insights card', async ({ page }) => {
  await login(page, user)
  await expect(page.getByText(/^Nothing in /)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Insights' })).toHaveCount(0)
})

test('Insights lists what matters most and every line opens the right place', async ({ page }) => {
  const today = await appToday(user.id)
  const arun = (await sql(`insert into people (user_id, name) values ($1, 'Arun') returning id`, [user.id])).rows[0].id as string
  const entry = (await sql(
    `insert into entries (user_id, kind, direction, person_id, title, principal_paise, start_date, total_payable_paise)
     values ($1, 'lent', 'receive', $2, 'Loan', 1000000, $3, 1000000) returning id`, [user.id, arun, shiftDate(today, -30)])).rows[0].id as string
  await sql(`insert into schedule_items (user_id, entry_id, seq, due_date, due_paise) values ($1, $2, 1, $3, 1000000)`, [user.id, entry, shiftDate(today, -12)])
  const card = (await sql(`insert into accounts (user_id, name, type, credit_limit_paise) values ($1, 'HDFC', 'credit_card', 1000000) returning id`, [user.id])).rows[0].id as string
  await sql(`insert into transactions (user_id, kind, amount_paise, date, account_id) values ($1, 'expense', 600000, $2, $3)`, [user.id, today, card])
  const food = (await sql(`select id from categories where user_id = $1 and name = 'Food'`, [user.id])).rows[0].id as string
  const cash = (await sql(`select id from accounts where user_id = $1 and name = 'Cash'`, [user.id])).rows[0].id as string
  await sql(`insert into transactions (user_id, kind, amount_paise, date, account_id, category_id) values ($1, 'expense', 120000, $2, $3, $4)`, [user.id, today, cash, food])
  await sql(`insert into budgets (user_id, category_id, limit_paise) values ($1, $2, 100000)`, [user.id, food])

  await login(page, user)
  const card_ = page.getByRole('region', { name: 'Insights' })
  await expect(card_).toBeVisible()
  const lines = card_.getByRole('button')
  // most important first: over budget, then the late friend, then the busy card
  await expect(lines.nth(0)).toContainText('Food budget is over by ₹200 (₹1,200 of ₹1,000)')
  await expect(lines.nth(1)).toContainText('Arun is 12 days late on ₹10,000')
  await expect(card_.getByRole('button', { name: /HDFC is 60% used \(₹6,000 of ₹10,000\)/ })).toBeVisible()
  expect(await lines.count()).toBeLessThanOrEqual(5)

  await card_.getByRole('button', { name: /^Arun is 12 days late/ }).click()
  await expect(page).toHaveURL(new RegExp(`/money/entry/${entry}$`))
  await page.goBack()

  await card_.getByRole('button', { name: /^HDFC is 60% used/ }).click()
  await expect(page).toHaveURL(new RegExp(`/activity\\?acc=${card}`))
  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible()
  await page.goBack()

  await card_.getByRole('button', { name: /^Food budget is over/ }).click()
  await expect(page).toHaveURL(new RegExp(`/activity\\?cat=${food}&d=month&type=spend`))
})

test('the Insights card can be hidden from Display, and money for friends is not your spend', async ({ page }) => {
  const today = await appToday(user.id)
  const cash = (await sql(`select id from accounts where user_id = $1 and name = 'Cash'`, [user.id])).rows[0].id as string
  const food = (await sql(`select id from categories where user_id = $1 and name = 'Food'`, [user.id])).rows[0].id as string
  // 90% of a ₹1,000 budget would be personal spend; but ₹800 of ₹1,000 was for a friend, so only ₹200 counts
  await sql(`insert into transactions (user_id, kind, amount_paise, for_other_paise, date, account_id, category_id) values ($1, 'expense', 100000, 80000, $2, $3, $4)`, [user.id, today, cash, food])
  await sql(`insert into budgets (user_id, category_id, limit_paise) values ($1, $2, 100000)`, [user.id, food])
  await login(page, user)
  const insights = page.getByRole('region', { name: 'Insights' })
  await expect(insights).toContainText('Biggest spend this month: ₹200 on Food') // personal amount only
  await expect(insights).not.toContainText('budget')

  // a budget that is nearly used does show, and the layout editor can hide the card again
  await sql(`update budgets set limit_paise = 22000 where user_id = $1`, [user.id])
  await page.reload()
  await expect(page.getByRole('region', { name: 'Insights' })).toContainText('Food budget is 91% used')
  await page.goto('/settings/display')
  await page.getByRole('switch', { name: 'Show Insights' }).uncheck()
  await page.getByRole('button', { name: 'Save layout' }).click()
  await expect.poll(async () => (await sql(`select dashboard_layout l from profiles where id = $1`, [user.id])).rows[0]?.l?.hidden).toContain('insights')
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'This month' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Insights' })).toHaveCount(0)
})
