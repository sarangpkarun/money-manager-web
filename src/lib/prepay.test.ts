import { describe, expect, it } from 'vitest'
import { allocatePayment } from './allocate'
import { prepayEstimate } from './prepay'
import { buildSchedule } from './schedule'

const emi = () => buildSchedule({ mode: 'reducing', principal: 10_000_000, count: 12, firstDate: '2026-01-15', rateBps: 1200 }).rows
const afterThree = () => {
  let rows = emi()
  for (let i = 1; i <= 3; i++) rows = allocatePayment(rows, (rows.find((r) => r.seq === i)?.due_paise ?? 0), `2026-0${i}-15`, i).rows
  return rows
}

describe('foreclose', () => {
  it('after 3 EMIs and before the 4th is due: principal left, nothing due, future interest waived', () => {
    const rows = afterThree()
    const paidPrincipal = emi().slice(0, 3).reduce((s, r) => s + r.principal_paise, 0)
    const futureInterest = emi().slice(3).reduce((s, r) => s + r.interest_paise, 0)
    const e = prepayEstimate(rows, '2026-04-01', { mode: 'foreclose' })
    expect(e).toMatchObject({ principalLeft: 10_000_000 - paidPrincipal, interestDue: 0, fee: 0, interestSaved: futureInterest })
    expect(e.total).toBe(e.principalLeft)
  })
  it('interest on rows already due is included', () => {
    const rows = afterThree()
    const e = prepayEstimate(rows, '2026-04-20', { mode: 'foreclose' }) // EMI 4 (15 Apr) is due and unpaid
    expect(e.interestDue).toBe(emi()[3]?.interest_paise)
    expect(e.total).toBe(e.principalLeft + e.interestDue)
  })
  it('adds a foreclosure fee as a percentage of principal left', () => {
    const e = prepayEstimate(afterThree(), '2026-04-01', { mode: 'foreclose', feeBps: 200 }) // 2%
    expect(e.fee).toBe(Math.round(e.principalLeft * 0.02))
    expect(e.total).toBe(e.principalLeft + e.fee)
  })
  it('a no-interest plan forecloses at exactly the outstanding amount', () => {
    const rows = allocatePayment(buildSchedule({ mode: 'equal', principal: 900_000, count: 9, firstDate: '2026-01-01' }).rows, 100_000, '2026-01-01').rows
    expect(prepayEstimate(rows, '2026-02-01', { mode: 'foreclose' })).toMatchObject({ total: 800_000, interestSaved: 0 })
  })
  it('a part-paid row only counts its unpaid share', () => {
    const rows = allocatePayment(buildSchedule({ mode: 'equal', principal: 1_000_000, count: 5, firstDate: '2026-01-01', interest: 'flat', rateBps: 1000 }).rows, 110_000, '2026-01-01').rows // half of row 1
    const e = prepayEstimate(rows, '2026-01-02', { mode: 'foreclose' })
    expect(e.total).toBeLessThanOrEqual(1_100_000 - 110_000)
    expect(e.principalLeft).toBe(4 * 200_000 + 100_000) // four untouched rows + half of row 1
  })
  it('a settled plan owes nothing', () => {
    const rows = allocatePayment(buildSchedule({ mode: 'equal', principal: 1000, count: 2, firstDate: '2026-01-01' }).rows, 1000, '2026-01-01').rows
    expect(prepayEstimate(rows, '2026-02-01', { mode: 'foreclose' })).toMatchObject({ total: 0, principalLeft: 0 })
  })
  it('validates feeBps', () => {
    expect(() => prepayEstimate(emi(), '2026-01-01', { mode: 'foreclose', feeBps: -1 })).toThrow(RangeError)
  })
})

describe('part prepay', () => {
  it('reports the shorter plan and interest saved, without touching the input', () => {
    const rows = emi()
    const snapshot = structuredClone(rows)
    const e = prepayEstimate(rows, '2026-02-01', { mode: 'part', amount: 2_000_000 })
    expect(e.rowsBefore).toBe(12)
    expect(e.rowsAfter).toBeLessThan(12)
    expect(e.removedSeqs.length).toBe(12 - e.rowsAfter)
    expect(e.newLastDue).toBe(rows[e.rowsAfter - 1]?.due_date)
    expect(e.interestSaved).toBeGreaterThan(0)
    expect(rows).toEqual(snapshot)
  })
  it('clearing everything leaves no last due date', () => {
    const rows = buildSchedule({ mode: 'equal', principal: 300_000, count: 3, firstDate: '2026-01-01' }).rows
    expect(prepayEstimate(rows, '2026-01-02', { mode: 'part', amount: 300_000 })).toMatchObject({ rowsAfter: 0, newLastDue: null })
  })
  it('rejects an amount over the balance', () => {
    expect(() => prepayEstimate(emi(), '2026-01-01', { mode: 'part', amount: 99_999_999_999 })).toThrow(/exceeds/)
  })
})
