import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { admin } from '../tests/rls/helpers'
import { appToday, createUser, deleteUser, login, shiftDate, sql, type E2EUser } from './helpers'

let user: E2EUser
test.beforeEach(async () => { user = await createUser('set') })
test.afterEach(async () => { await deleteUser(user.id).catch(() => undefined) })

async function addExpense(page: Page, amount: string, category: RegExp, shown = amount) {
  await page.getByRole('button', { name: 'Quick add' }).click()
  await page.getByLabel('Amount').pressSequentially(amount)
  await page.getByRole('button', { name: category }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status').filter({ hasText: `Added ₹${shown}` })).toBeVisible()
}

test('number format changes amounts everywhere and survives a reload', async ({ page }) => {
  await login(page, user)
  await addExpense(page, '123456', /Food/, '1,23,456')
  const month = page.getByRole('region', { name: 'This month' })
  await expect(month.getByLabel('Spent ₹1,23,456')).toBeVisible()

  await page.goto('/settings/display')
  await page.getByRole('button', { name: 'Western' }).click()
  await expect.poll(async () => (await sql(`select number_format f from profiles where id = $1`, [user.id])).rows[0]?.f).toBe('western')
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'This month' }).getByLabel('Spent ₹123,456')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('region', { name: 'This month' }).getByLabel('Spent ₹123,456')).toBeVisible()
})

test('date format changes day labels in Activity', async ({ page }) => {
  await login(page, user)
  await addExpense(page, '50', /Food/)
  const old = shiftDate(await appToday(user.id), -20)
  await sql(`update transactions set date = $2 where user_id = $1`, [user.id, old])

  await page.goto('/settings/display')
  await page.getByRole('button', { name: '2026-11-05' }).click()
  await expect.poll(async () => (await sql(`select date_format f from profiles where id = $1`, [user.id])).rows[0]?.f).toBe('yyyy-MM-dd')
  await page.goto('/activity')
  if (old.slice(0, 7) !== (await appToday(user.id)).slice(0, 7)) await page.getByRole('button', { name: 'Previous month' }).click()
  // same year: the year is left out, so the day shows as MM-dd
  await expect(page.getByText(new RegExp(`, ${old.slice(5)}$`))).toBeVisible()
})

test('Home card layout: hide a card and move another, immediately and after reload', async ({ page }) => {
  await login(page, user)
  await addExpense(page, '80', /Food/)
  await expect(page.getByRole('region', { name: 'Recent activity' })).toBeVisible()

  await page.goto('/settings/display')
  await page.getByRole('switch', { name: 'Show Recent activity' }).uncheck()
  await page.getByRole('button', { name: 'Save layout' }).click()
  await expect.poll(async () => (await sql(`select dashboard_layout l from profiles where id = $1`, [user.id])).rows[0]?.l?.hidden).toContain('recent')

  await page.goto('/')
  await expect(page.getByRole('region', { name: 'This month' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Recent activity' })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('region', { name: 'Recent activity' })).toHaveCount(0)

  await page.goto('/settings/display')
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect.poll(async () => (await sql(`select dashboard_layout l from profiles where id = $1`, [user.id])).rows[0]?.l).toBeNull()
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Recent activity' })).toBeVisible()
})

test('Export gives a JSON with everything and a CSV with the transaction', async ({ page }) => {
  await login(page, user)
  await addExpense(page, '250', /Food/)
  await page.goto('/settings/export')

  const [json] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export everything' }).click()])
  expect(json.suggestedFilename()).toMatch(/^money-manager-\d{4}-\d{2}-\d{2}\.json$/)
  const doc = JSON.parse(await readFile((await json.path())!, 'utf8'))
  expect(doc.counts.transactions).toBe(1)
  expect(doc.tables.transactions[0].amount_paise).toBe(25_000)
  expect(doc.profile.id).toBeUndefined()
  expect(JSON.stringify(doc)).not.toContain(user.email)

  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export transactions' }).click()])
  const text = await readFile((await csv.path())!, 'utf8')
  expect(text.split('\r\n')[0]).toBe('Date,Type,Amount,Account,To account,Category,Title,Place,Notes,Tags,Paid for others,Your share')
  expect(text).toMatch(/,Spent,250\.00,.*,Food,/)
})

test('Privacy and About open from Settings', async ({ page }) => {
  await login(page, user)
  await page.goto('/settings')
  await page.getByRole('link', { name: /^Privacy/ }).click()
  await expect(page.getByRole('heading', { name: 'Privacy' })).toBeVisible()
  await page.getByRole('link', { name: /Settings/ }).first().click()
  await page.getByRole('link', { name: /^About/ }).click()
  await expect(page.getByText('Money Manager', { exact: true })).toBeVisible()
  await expect(page.getByText('Version')).toBeVisible()
})

test('Delete account removes the user and every row, then returns to sign-in', async ({ page }) => {
  await login(page, user)
  await addExpense(page, '60', /Food/)
  // the local stack has no Edge runtime: stand in for the function with the same admin call it makes
  await page.route('**/functions/v1/delete-account', async (route) => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const { error } = await admin().auth.admin.deleteUser(user.id)
    return route.fulfill({ status: error ? 500 : 200, headers: cors, contentType: 'application/json', body: JSON.stringify(error ? { error: 'x' } : { deleted: true }) })
  })

  await page.goto('/settings/delete')
  const go = page.getByRole('button', { name: 'Delete my account' })
  await expect(go).toBeDisabled()
  await page.getByLabel(/^Type .* to confirm/).fill(user.email)
  await go.click()
  await page.getByRole('button', { name: 'Delete forever' }).click()

  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible()
  for (const t of ['profiles', 'accounts', 'categories', 'transactions', 'entries', 'notes']) {
    const col = t === 'profiles' ? 'id' : 'user_id'
    expect((await sql(`select count(*)::int n from ${t} where ${col} = $1`, [user.id])).rows[0]?.n, t).toBe(0)
  }
  expect((await sql(`select count(*)::int n from auth.users where id = $1`, [user.id])).rows[0]?.n).toBe(0)
})
