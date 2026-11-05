import { describe, expect, it, vi } from 'vitest'
import { runSender, type Claimed, type SenderDeps } from '../../supabase/functions/_shared/sender.ts'

const sub = (n: number) => ({ endpoint: `https://push.example/${n}`, keys: { p256dh: 'p', auth: 'a' } })
const item = (key: string, subs = [sub(1)]): Claimed => ({ user_id: 'u1', key, title: 'T', body: 'B', url: '/x', subscriptions: subs })

function deps(items: Claimed[], status: (endpoint: string) => number | Error = () => 201, clock = () => 0) {
  const d = {
    claim: vi.fn(async () => items),
    send: vi.fn<SenderDeps['send']>(async (s) => { const r = status(s.endpoint); if (r instanceof Error) throw r; return { status: r } }),
    markSent: vi.fn<SenderDeps['markSent']>(async () => undefined), release: vi.fn<SenderDeps['release']>(async () => undefined), removeSubscription: vi.fn<SenderDeps['removeSubscription']>(async () => undefined), now: vi.fn(clock),
  }
  return d as typeof d & SenderDeps
}

describe('runSender', () => {
  it('sends each item to each device, with the key as the notification tag, and confirms it', async () => {
    const d = deps([item('k1', [sub(1), sub(2)]), item('k2')])
    expect(await runSender(d)).toEqual({ claimed: 2, sent: 2, failed: 0, pruned: 0, released: 0 })
    expect(d.send).toHaveBeenCalledTimes(3)
    expect(d.send.mock.calls[0]![1]).toEqual({ title: 'T', body: 'B', url: '/x', tag: 'k1' })
    expect(d.markSent.mock.calls).toEqual([['u1', 'k1'], ['u1', 'k2']])
    expect(d.release).not.toHaveBeenCalled()
  })

  it('does nothing when nothing is due', async () => {
    const d = deps([])
    expect(await runSender(d)).toEqual({ claimed: 0, sent: 0, failed: 0, pruned: 0, released: 0 })
    expect(d.send).not.toHaveBeenCalled()
  })

  it('one failing device does not stop the others: delivered if any device accepted', async () => {
    const d = deps([item('k1', [sub(1), sub(2), sub(3)])], (e) => (e.endsWith('/1') ? 500 : e.endsWith('/2') ? new Error('network') : 201))
    expect(await runSender(d)).toMatchObject({ sent: 1, failed: 2, released: 0 })
    expect(d.markSent).toHaveBeenCalledOnce()
  })

  it('gives the claim back when no device accepted it, so the next run retries', async () => {
    const d = deps([item('k1', [sub(1), sub(2)])], () => 503)
    expect(await runSender(d)).toMatchObject({ sent: 0, failed: 2, released: 1 })
    expect(d.release).toHaveBeenCalledWith('u1', 'k1')
    expect(d.markSent).not.toHaveBeenCalled()
  })

  it('removes devices the push service says are gone (404/410), and keeps sending to the rest', async () => {
    const d = deps([item('k1', [sub(1), sub(2), sub(3)])], (e) => (e.endsWith('/1') ? 410 : e.endsWith('/2') ? 404 : 201))
    const s = await runSender(d)
    expect(s).toMatchObject({ sent: 1, pruned: 2 })
    expect(d.removeSubscription.mock.calls.map((c) => c[0])).toEqual(['https://push.example/1', 'https://push.example/2'])
    expect(d.markSent).toHaveBeenCalledOnce()
  })

  it('when every device is gone there is nothing to retry: confirmed, not released, not counted as sent', async () => {
    const d = deps([item('k1', [sub(1), sub(2)])], () => 410)
    expect(await runSender(d)).toEqual({ claimed: 1, sent: 0, failed: 0, pruned: 2, released: 0 })
    expect(d.markSent).toHaveBeenCalledOnce()
    expect(d.release).not.toHaveBeenCalled()
  })

  it('a gone device plus a failing one is a failure to retry (the failing one may still work)', async () => {
    const d = deps([item('k1', [sub(1), sub(2)])], (e) => (e.endsWith('/1') ? 410 : 500))
    expect(await runSender(d)).toMatchObject({ pruned: 1, failed: 1, released: 1 })
    expect(d.markSent).not.toHaveBeenCalled()
  })

  it('an item with no devices at all is released', async () => {
    const d = deps([item('k1', [])])
    expect(await runSender(d)).toMatchObject({ sent: 0, released: 1 })
  })

  it('runs out of time: the rest are released untouched so the next run takes them', async () => {
    let t = 0
    const d = deps([item('k1'), item('k2'), item('k3')], () => 201, () => t)
    d.send.mockImplementation(async () => { t += 20_000; return { status: 201 } })
    const s = await runSender(d, { budgetMs: 30_000 })
    expect(s).toMatchObject({ claimed: 3, sent: 2, released: 1 })
    expect(d.release).toHaveBeenCalledWith('u1', 'k3')
  })

  it('caps how many items one run handles (the rest are never claimed past the cap)', async () => {
    const d = deps([item('a'), item('b'), item('c')])
    expect((await runSender(d, { maxItems: 2 })).claimed).toBe(2)
  })
})
