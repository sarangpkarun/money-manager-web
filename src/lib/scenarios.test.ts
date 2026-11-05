import { describe, expect, it } from 'vitest'
import { allocatePayment, nextUnpaid, outstanding } from './allocate'
import { financedAmount } from './emi'
import { rowLabel } from './labels'
import { buildSchedule } from './schedule'

describe('scenario C: ₹60,000 store EMI, ₹6,000 down, 9 months, no-cost, first EMI 10 Dec', () => {
  const financed = financedAmount(6_000_000, 600_000)
  const plan = buildSchedule({ mode: 'reducing', principal: financed, count: 9, firstDate: '2026-12-10', rateBps: 1500, noCost: true })

  it('summary: next EMI, remaining total, and the seller absorbs the interest', () => {
    expect(plan.rows).toHaveLength(9)
    expect(plan.total_interest_paise).toBe(0) // you pay no interest: the seller absorbs it
    expect(outstanding(plan.rows)).toBe(5_400_000)
    expect(nextUnpaid(plan.rows)).toMatchObject({ seq: 1, due_date: '2026-12-10', due_paise: 600_000 })
  })

  it('after paying EMI #1 on time the summary moves on', () => {
    const rows = allocatePayment(plan.rows, 600_000, '2026-12-10', 1).rows
    expect(rowLabel(rows[0]!, '2026-12-11').kind).toBe('paid_on_time')
    expect(outstanding(rows)).toBe(4_800_000)
    expect(nextUnpaid(rows)).toMatchObject({ seq: 2, due_date: '2027-01-10' })
  })
})
