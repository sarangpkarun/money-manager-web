import { expect, test } from '@playwright/test'
import { createUser, deleteUser, login, sql, type E2EUser } from './helpers'

let user: E2EUser
test.beforeEach(async () => { user = await createUser('errlog') })
test.afterEach(async () => { await deleteUser(user.id) })

test('an uncaught error is stored scrubbed in your own log and shown in Settings, About', async ({ page }) => {
  await login(page, user)
  await page.getByRole('button', { name: 'Quick add' }).click() // some screen activity first
  await page.keyboard.press('Escape')

  // an error that carries personal data: amount, email and a URL
  await page.evaluate(() => { setTimeout(() => { throw new Error(`Could not save ₹25000 for me@example.com at https://x.test/a?b=1`) }, 0) })
  await expect.poll(async () => (await sql(`select count(*)::int n from client_errors where user_id = $1`, [user.id])).rows[0]?.n).toBe(1)

  const row = (await sql(`select kind, message, stack, route, app_version, length(user_agent) ua from client_errors where user_id = $1`, [user.id])).rows[0]
  expect(row.kind).toBe('error')
  expect(row.message).toBe('Error: Could not save ₹##### for <email> at <url>')
  expect(JSON.stringify(row)).not.toMatch(/25000|example\.com|x\.test/)
  expect(row.stack ?? '').not.toMatch(/\d/)
  expect(row.route).toBe('/')
  expect(row.app_version).toBeTruthy()

  await page.goto('/settings/about')
  const list = page.getByRole('region', { name: 'Recent errors' })
  await expect(list).toContainText('Could not save ₹##### for <email> at <url>')

  await list.getByRole('button', { name: 'Clear' }).click()
  await expect(list).toContainText('None.')
  expect((await sql(`select count(*)::int n from client_errors where user_id = $1`, [user.id])).rows[0]?.n).toBe(0)
})
