import { expect, test } from '@playwright/test'
import { createUser, deleteUser, login, sql, type E2EUser } from './helpers'

let user: E2EUser
const ROWS = 5000

test.beforeAll(async () => {
  user = await createUser('scale')
  // 5,000 transactions spread over the first five days of the current (India) month, so they all show up in Activity
  await sql(
    `insert into transactions (user_id, kind, amount_paise, date, account_id, category_id, title, place, tags)
     select $1, 'expense', 1000 + (g % 90000),
            date_trunc('month', (now() at time zone 'Asia/Kolkata'))::date + (g % 5),
            (select id from accounts where user_id = $1 limit 1),
            (select id from categories where user_id = $1 and kind = 'expense' order by sort limit 1 offset (g % 12)),
            'Item ' || g, 'Place ' || (g % 40), array['t' || (g % 7)]
     from generate_series(1, ${ROWS}) g`, [user.id])
})
test.afterAll(async () => { await deleteUser(user.id) })

test('5,000 rows: only a window is in the DOM, and scrolling loads more pages', async ({ page }) => {
  await login(page, user)
  await page.getByRole('link', { name: 'Activity' }).click()
  const list = page.getByTestId('activity-list')
  const rendered = () => list.locator('[data-index]').count()

  await expect.poll(rendered).toBeGreaterThan(5)
  expect(await rendered()).toBeLessThan(80) // virtualised: nowhere near 5,000

  const requests: string[] = []
  page.on('request', (r) => { if (r.url().includes('search_transactions')) requests.push(r.url()) })
  for (let i = 0; i < 6; i++) {
    await list.evaluate((el) => { el.scrollTop = el.scrollHeight })
    await page.waitForTimeout(250)
  }
  expect(requests.length).toBeGreaterThanOrEqual(2) // infinite scroll fetched further pages
  expect(await rendered()).toBeLessThan(80) // and the DOM is still small
})

test('search finds one row among 5,000 quickly', async ({ page }) => {
  await login(page, user)
  await page.getByRole('link', { name: 'Activity' }).click()
  await page.getByRole('button', { name: /open details/ }).first().waitFor()

  // server-side search time (request -> response) is the plan's metric: < 300 ms
  const started = new Map<string, number>()
  const durations: number[] = []
  page.on('request', (r) => { if (r.url().includes('search_transactions') && r.postData()?.includes('Item 4999')) started.set(r.url() + r.postData(), Date.now()) })
  page.on('response', (r) => {
    const key = r.url() + r.request().postData()
    const t = started.get(key)
    if (t) durations.push(Date.now() - t)
  })

  const t0 = Date.now()
  await page.getByLabel('Search transactions').fill('Item 4999')
  await expect(page.getByRole('button', { name: 'Item 4999, open details' })).toBeVisible()
  const total = Date.now() - t0
  console.log(`search: server ${durations.join('/')} ms, end-to-end ${total} ms (includes the 250 ms debounce, dev build)`)
  expect(durations.length).toBeGreaterThan(0)
  expect(Math.max(...durations)).toBeLessThan(300)
  expect(total).toBeLessThan(3000) // loose guard against gross regressions; the dev server is slower than production
})
