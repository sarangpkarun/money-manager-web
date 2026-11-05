// What the send-reminders function does, with every outside call injected so it can be tested without a network or a database.
import type { PushResult } from './webpush.ts'

export interface Claimed {
  user_id: string
  key: string
  title: string
  body: string
  url: string
  subscriptions: { endpoint: string; keys: { p256dh: string; auth: string } }[]
}

export interface SenderDeps {
  /** the database call that selects AND claims what is due */
  claim(): Promise<Claimed[]>
  send(sub: Claimed['subscriptions'][number], payload: { title: string; body: string; url: string; tag: string }): Promise<PushResult>
  markSent(userId: string, key: string): Promise<void>
  /** give the claim back so the next run retries */
  release(userId: string, key: string): Promise<void>
  removeSubscription(endpoint: string): Promise<void>
  now(): number
}

export interface SenderStats { claimed: number; sent: number; failed: number; pruned: number; released: number }

const ACCEPTED = (s: number) => s >= 200 && s < 300
const GONE = (s: number) => s === 404 || s === 410

/**
 * Sends everything that was claimed. An item counts as delivered when at least one device accepted it, or when every device is gone
 * (nothing left to retry). Otherwise, and for items we ran out of time for, the claim is released so the next run tries again.
 * One failing device never stops the others.
 */
export async function runSender(deps: SenderDeps, opts: { maxItems?: number; budgetMs?: number } = {}): Promise<SenderStats> {
  const budget = opts.budgetMs ?? 45_000
  const started = deps.now()
  const stats: SenderStats = { claimed: 0, sent: 0, failed: 0, pruned: 0, released: 0 }
  const items = (await deps.claim()).slice(0, opts.maxItems ?? 500)
  stats.claimed = items.length

  for (const item of items) {
    if (deps.now() - started > budget) { await deps.release(item.user_id, item.key); stats.released++; continue }
    let accepted = 0
    let gone = 0
    for (const sub of item.subscriptions ?? []) {
      try {
        const res = await deps.send(sub, { title: item.title, body: item.body, url: item.url, tag: item.key })
        if (ACCEPTED(res.status)) accepted++
        else if (GONE(res.status)) { gone++; stats.pruned++; await deps.removeSubscription(sub.endpoint) }
        else stats.failed++
      } catch {
        stats.failed++
      }
    }
    if (accepted > 0 || (gone > 0 && gone === (item.subscriptions ?? []).length)) { await deps.markSent(item.user_id, item.key); if (accepted > 0) stats.sent++ }
    else { await deps.release(item.user_id, item.key); stats.released++ }
  }
  return stats
}
