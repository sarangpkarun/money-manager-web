import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  allocatePayment, isPaid, nextUnpaid, outstanding, remaining, totalPaid, undoPayment,
} from './allocate'
import { buildSchedule, type ScheduleRow } from './schedule'

const plan = (principal: number, count: number, firstDate = '2026-12-05', period: 'monthly' | 'weekly' = 'monthly') =>
  buildSchedule({ mode: 'equal', principal, count, firstDate, period }).rows

describe('allocatePayment', () => {
  it('earliest-unpaid by default, completing rows and recording paid_on', () => {
    const { rows, parts } = allocatePayment(plan(1_500_000, 3), 750_000, '2026-12-06')
    expect(rows.map((r) => r.paid_paise)).toEqual([500_000, 250_000, 0])
    expect(rows[0]?.paid_on).toBe('2026-12-06')
    expect(rows[1]?.paid_on).toBeNull()
    expect(parts).toEqual([{ seq: 1, amount: 500_000, completed: true }, { seq: 2, amount: 250_000, completed: false }])
  })

  it('a chosen row can be paid out of order (scenario D: row 3 first)', () => {
    const { rows, parts } = allocatePayment(plan(200_000, 4, '2026-03-01', 'weekly'), 50_000, '2026-03-17', 3)
    expect(rows.map((r) => isPaid(r))).toEqual([false, false, true, false])
    expect(rows[2]?.paid_on).toBe('2026-03-17')
    expect(parts).toEqual([{ seq: 3, amount: 50_000, completed: true }])
  })

  it('excess over the chosen row spills to the earliest unpaid rows', () => {
    const { rows, parts } = allocatePayment(plan(200_000, 4, '2026-03-01', 'weekly'), 80_000, '2026-03-09', 2)
    expect(rows.map((r) => r.paid_paise)).toEqual([30_000, 50_000, 0, 0])
    expect(parts.map((p) => p.seq)).toEqual([2, 1])
  })

  it('a partial payment leaves paid_on empty', () => {
    const { rows } = allocatePayment(plan(500_000, 1), 100_000, '2026-12-05')
    expect(rows[0]).toMatchObject({ paid_paise: 100_000, paid_on: null })
  })

  it('can pay the whole balance and nothing is left', () => {
    const { rows } = allocatePayment(plan(1_000, 3), 1_000, '2026-12-05')
    expect(outstanding(rows)).toBe(0)
    expect(nextUnpaid(rows)).toBeUndefined()
  })

  it('does not mutate its input', () => {
    const before = plan(100_000, 2)
    const snapshot = structuredClone(before)
    allocatePayment(before, 60_000, '2026-12-05')
    expect(before).toEqual(snapshot)
  })

  it('rejects overpayment, non-positive amounts, unknown or already paid target rows', () => {
    const rows = plan(100_000, 2)
    expect(() => allocatePayment(rows, 100_001, '2026-12-05')).toThrow(/exceeds/)
    expect(() => allocatePayment(rows, 0, '2026-12-05')).toThrow(RangeError)
    expect(() => allocatePayment(rows, 1.5, '2026-12-05')).toThrow(RangeError)
    expect(() => allocatePayment(rows, 100, '2026-12-05', 9)).toThrow(/No row/)
    const paid = allocatePayment(rows, 50_000, '2026-12-05').rows
    expect(() => allocatePayment(paid, 100, '2026-12-05', 1)).toThrow(/already paid/)
  })

  it('helpers', () => {
    const rows = allocatePayment(plan(300_000, 3), 150_000, '2026-12-05').rows
    expect(remaining(rows[1] as ScheduleRow)).toBe(50_000)
    expect(totalPaid(rows)).toBe(150_000)
    expect(nextUnpaid(rows)?.seq).toBe(2)
  })
})

describe('undoPayment', () => {
  it('restores the rows exactly', () => {
    const start = plan(1_500_000, 3)
    const { rows, parts } = allocatePayment(start, 750_000, '2026-12-06')
    expect(undoPayment(rows, parts)).toEqual(start)
  })
  it('a row that is no longer fully paid loses paid_on, other payments stay', () => {
    const a = allocatePayment(plan(200_000, 2), 60_000, '2026-12-05')
    const b = allocatePayment(a.rows, 40_000, '2026-12-07') // completes row 1
    expect(b.rows[0]?.paid_on).toBe('2026-12-07')
    const after = undoPayment(b.rows, a.parts) // undo the first, partial payment
    expect(after[0]).toMatchObject({ paid_paise: 40_000, paid_on: null })
  })
  it('refuses to undo more than was paid', () => {
    expect(() => undoPayment(plan(100_000, 1), [{ seq: 1, amount: 1, completed: false }])).toThrow(/Cannot undo/)
  })
  it('leaves untouched rows as they are', () => {
    const rows = plan(100_000, 2)
    expect(undoPayment(rows, [])).toEqual(rows)
  })
})

describe('properties', () => {
  it('any sequence of payments keeps paid + outstanding = total, and undoing everything restores the plan', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1_000, max: 100_000_000 }), fc.integer({ min: 1, max: 24 }),
        fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 8 }), fc.nat(30),
        (principal, count, pcts, targetSeed) => {
          const start = plan(principal, count)
          let rows = start
          const history: ReturnType<typeof allocatePayment>['parts'][] = []
          for (const pct of pcts) {
            const left = outstanding(rows)
            if (left === 0) break
            const amount = Math.max(1, Math.floor((left * pct) / 100))
            const open = rows.filter((r) => !isPaid(r))
            const target = targetSeed % 2 === 0 ? (open[targetSeed % open.length] as ScheduleRow).seq : undefined
            const res = allocatePayment(rows, amount, '2026-12-05', target)
            if (res.parts.reduce((s, p) => s + p.amount, 0) !== amount) return false
            rows = res.rows
            history.push(res.parts)
            if (totalPaid(rows) + outstanding(rows) !== start.reduce((s, r) => s + r.due_paise, 0)) return false
          }
          for (const parts of history.reverse()) rows = undoPayment(rows, parts)
          return JSON.stringify(rows) === JSON.stringify(start)
        },
      ),
    )
  })
})
