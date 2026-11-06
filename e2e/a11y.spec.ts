import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { appToday, createUser, deleteUser, login, shiftDate, sql, type E2EUser, tap } from './helpers'

const RULES = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

/** Runs axe on what is on screen now; fails with a readable list of rule, impact and the offending elements. */
async function audit(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(RULES).analyze()
  const report = violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join('\n    ')}`)
  expect.soft(report, `${label}: accessibility violations`).toEqual([])
}

let user: E2EUser
let entryId = ''

async function seed(u: E2EUser) {
  const today = await appToday(u.id)
  const cash = (await sql(`select id from accounts where user_id = $1 and name = 'Cash'`, [u.id])).rows[0].id as string
  const food = (await sql(`select id from categories where user_id = $1 and name = 'Food'`, [u.id])).rows[0].id as string
  await sql(`insert into transactions (user_id, kind, amount_paise, date, account_id, category_id, title, place) values ($1,'expense',25000,$2,$3,$4,'Lunch','Cafe')`, [u.id, today, cash, food])
  await sql(`insert into transactions (user_id, kind, amount_paise, date, account_id, title) values ($1,'income',900000,$2,$3,'Salary')`, [u.id, today, cash])
  await sql(`insert into accounts (user_id, name, type, credit_limit_paise, due_day) values ($1, 'HDFC', 'credit_card', 1000000, 18)`, [u.id])
  const arun = (await sql(`insert into people (user_id, name) values ($1, 'Arun') returning id`, [u.id])).rows[0].id as string
  entryId = (await sql(
    `insert into entries (user_id, kind, direction, person_id, title, principal_paise, start_date, total_payable_paise)
     values ($1, 'lent', 'receive', $2, 'Loan to Arun', 1000000, $3, 1000000) returning id`, [u.id, arun, shiftDate(today, -30)])).rows[0].id as string
  await sql(`insert into schedule_items (user_id, entry_id, seq, due_date, due_paise, paid_paise) values ($1, $2, 1, $3, 1000000, 300000)`, [u.id, entryId, shiftDate(today, -12)])
  await sql(`insert into notes (user_id, kind, title, date) values ($1, 'task', 'Bring documents', $2)`, [u.id, today])
}

test.beforeEach(async () => { user = await createUser('a11y'); await seed(user) })
test.afterEach(async () => { await deleteUser(user.id) })

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('theme', t), theme)
    })

    test('main tabs', async ({ page }) => {
      await login(page, user)
      await expect(page.getByRole('region', { name: 'This month' })).toBeVisible()
      await expect(page.getByRole('region', { name: 'Insights' })).toBeVisible()
      await audit(page, 'Home')

      await page.getByRole('link', { name: 'Activity' }).click()
      await expect(page.getByRole('button', { name: /^Lunch.*open details/ })).toBeVisible()
      await audit(page, 'Activity')

      await page.getByRole('link', { name: 'Money' }).click()
      await expect(page.getByRole('button', { name: /^Loan to Arun/ })).toBeVisible()
      await audit(page, 'Money')

      await page.getByRole('link', { name: 'Calendar' }).click()
      await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible()
      await audit(page, 'Calendar')
    })

    test('sheets and detail screens', async ({ page }) => {
      await login(page, user)
      await page.getByRole('link', { name: 'Activity' }).click()
      await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible() // Home stays mounted for a moment: wait for the switch
      await tap(page.getByRole('button', { name: /^Lunch.*open details/ }))
      await expect(page.getByRole('dialog')).toBeVisible()
      await audit(page, 'Transaction detail sheet')
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toHaveCount(0)

      await page.getByRole('button', { name: 'Quick add' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await audit(page, 'Quick Add sheet')
      await page.keyboard.press('Escape')

      await page.goto(`/money/entry/${entryId}`)
      await expect(page.getByRole('heading', { name: /Loan to Arun/ })).toBeVisible()
      await audit(page, 'Entry screen')
    })

    test('settings screens', async ({ page }) => {
      await login(page, user)
      for (const [path, heading] of [
        ['/settings', 'Settings'], ['/settings/profile', 'Profile'], ['/settings/display', 'Display'], ['/settings/reminders', 'Reminders'],
        ['/settings/accounts', 'Accounts'], ['/settings/categories', 'Categories'], ['/settings/export', 'Export'], ['/settings/privacy', 'Privacy'],
        ['/settings/about', 'About'], ['/settings/delete', 'Delete account'],
      ] as const) {
        await page.goto(path)
        await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
        await audit(page, `Settings ${path}`)
      }
    })
  })
}

test('sign-in screen', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible()
  await audit(page, 'Sign in')
})

test('reduced motion: transitions and animations are effectively off', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const login = page.getByRole('button', { name: 'Log in' })
  await expect(login).toBeVisible()
  await expect(login).toHaveCSS('transition-duration', '1e-05s') // 0.01 ms
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(login).not.toHaveCSS('transition-duration', '1e-05s')
})
