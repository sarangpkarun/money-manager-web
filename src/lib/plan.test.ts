import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { PLAN_MODES, planPreview, planRpcFields, planSummary, rowsFull, rowsPayload, toPlanInput, type PlanSpec } from './plan'
import { diffRows, lastOpenDate } from './rowsDiff'
import { addExtraPayment, changeAmount, skipPeriod } from './respread'
import { buildSchedule } from './schedule'

const spec = (o: Partial<PlanSpec> = {}): PlanSpec => ({ mode: 'equal', principal: 5_000_000, count: 10, firstDate: '2026-12-05', ...o })

describe('toPlanInput', () => {
  it('maps every mode to the schedule builder input', () => {
    expect(toPlanInput(spec())).toMatchObject({ mode: 'equal', period: 'monthly', interest: 'none' })
    expect(toPlanInput(spec({ mode: 'weekly', count: 4 }))).toMatchObject({ mode: 'equal', period: 'weekly' })
    expect(toPlanInput(spec({ mode: 'installment', amount: 500_000 }))).toMatchObject({ mode: 'installment', amount: 500_000 })
    expect(toPlanInput(spec({ mode: 'custom', dates: ['2026-12-05', '2027-01-20'], interest: 'flat', rateBps: 1000 }))).toMatchObject({ mode: 'custom', interest: 'flat' })
    expect(toPlanInput(spec({ mode: 'emi', rateBps: 1200 }))).toMatchObject({ mode: 'reducing', rateBps: 1200 })
    expect(toPlanInput(spec({ mode: 'nocost' }))).toMatchObject({ mode: 'reducing', noCost: true })
  })
  it('explains what is missing', () => {
    const msg = (s: PlanSpec) => { try { toPlanInput(s); return null } catch (e) { return (e as Error).message } }
    expect(msg(spec({ principal: 0 }))).toBe('Enter an amount')
    expect(msg(spec({ firstDate: '' }))).toBe('Choose the first date')
    expect(msg(spec({ count: 0 }))).toBe('How many instalments?')
    expect(msg(spec({ interest: 'flat' }))).toBe('Enter an interest rate')
    expect(msg(spec({ mode: 'installment' }))).toBe('Enter the amount of each instalment')
    expect(msg(spec({ mode: 'installment', amount: 1, interest: 'simple' }))).toBe('Enter an interest rate')
    expect(msg(spec({ mode: 'custom', dates: [] }))).toBe('Add at least one date')
    expect(msg(spec({ mode: 'custom', dates: ['2026-12-05'], interest: 'simple', rateBps: 100 }))).toMatch(/no interest or flat/)
    expect(msg(spec({ mode: 'emi' }))).toBe('Enter an interest rate')
    expect(msg(spec({ mode: 'emi', rateBps: 100, count: 0 }))).toBe('How many months?')
    expect(msg(spec({ mode: 'nocost', count: 0 }))).toBe('How many months?')
  })
  it('every mode has a label and hint', () => expect(PLAN_MODES.every((m) => m.label && m.hint)).toBe(true))
})

describe('planPreview', () => {
  it('scenario B: 10 × ₹5,000, last date 5 Sep 2027', () => {
    const r = planPreview(spec())
    expect(r.ok && r.preview).toMatchObject({ count: 10, monthly: 500_000, lastDiffers: false, totalInterest: 0, totalPayable: 5_000_000, firstDate: '2026-12-05', lastDate: '2027-09-05' })
  })
  it('scenario C: ₹54,000 no-cost over 9 months from 10 Dec', () => {
    const r = planPreview(spec({ mode: 'nocost', principal: 5_400_000, count: 9, firstDate: '2026-12-10', rateBps: 1500 }))
    expect(r.ok && r.preview).toMatchObject({ count: 9, monthly: 600_000, totalInterest: 0, lastDate: '2027-08-10' })
  })
  it('scenario D: weekly 4 × ₹500', () => {
    const r = planPreview(spec({ mode: 'weekly', principal: 200_000, count: 4, firstDate: '2026-03-01' }))
    expect(r.ok && r.preview.rows.map((x) => x.due_date)).toEqual(['2026-03-01', '2026-03-08', '2026-03-15', '2026-03-22'])
  })
  it('flags a last row that differs (rounding or a smaller remainder)', () => {
    const r = planPreview(spec({ principal: 1_000_000, count: 3 }))
    expect(r.ok && r.preview).toMatchObject({ lastDiffers: true, monthly: 333_333, lastDue: 333_334 })
    const i = planPreview(spec({ mode: 'installment', principal: 1_200_000, amount: 500_000 }))
    expect(i.ok && i.preview).toMatchObject({ count: 3, lastDue: 200_000 })
  })
  it('reducing EMI has interest', () => {
    const r = planPreview(spec({ mode: 'emi', principal: 10_000_000, count: 12, rateBps: 1200, firstDate: '2026-01-15' }))
    expect(r.ok && r.preview.monthly).toBe(888_488)
    expect(r.ok && r.preview.totalInterest).toBeGreaterThan(0)
  })
  it('returns the message instead of throwing', () => {
    expect(planPreview(spec({ count: 0 }))).toEqual({ ok: false, error: 'How many instalments?' })
    expect(planPreview(spec({ principal: 100, count: 1000 }))).toEqual({ ok: false, error: 'Amount is too small to split into this many instalments' })
    expect(planPreview(spec({ count: 5000 })).ok).toBe(false)
  })
  it('summary reads naturally', () => {
    const a = planPreview(spec()); const b = planPreview(spec({ principal: 1_000_000, count: 3 })); const w = planPreview(spec({ mode: 'weekly', principal: 200_000, count: 4 }))
    expect(a.ok && planSummary(a.preview)).toBe('10 × ₹5,000 · interest ₹0 · last 2027-09-05')
    expect(b.ok && planSummary(b.preview)).toBe('2 × ₹3,333.33 + ₹3,333.34 · interest ₹0 · last 2027-02-05')
    expect(w.ok && planSummary(w.preview, 'weekly')).toContain('4 × ₹500 weekly')
  })
})

describe('planRpcFields', () => {
  const fields = (s: PlanSpec) => { const r = planPreview(s); if (!r.ok) throw new Error(r.error); return planRpcFields(s, r.preview) }
  it('records how interest is stored', () => {
    expect(fields(spec())).toEqual({ interest: 'none', rateBps: 0, noCost: false })
    expect(fields(spec({ interest: 'flat', rateBps: 1000 }))).toEqual({ interest: 'flat', rateBps: 1000, noCost: false })
    expect(fields(spec({ interest: 'simple', rateBps: 1200 }))).toEqual({ interest: 'simple', rateBps: 1200, noCost: false })
    expect(fields(spec({ mode: 'emi', rateBps: 1200 }))).toEqual({ interest: 'reducing', rateBps: 1200, noCost: false })
    expect(fields(spec({ mode: 'nocost', rateBps: 1500 }))).toEqual({ interest: 'reducing', rateBps: 1500, noCost: true })
    expect(fields(spec({ mode: 'nocost' }))).toEqual({ interest: 'reducing', rateBps: 0, noCost: true })
  })
})

describe('payloads', () => {
  it('rowsPayload carries what the server checks; rowsFull adds paid state', () => {
    const rows = buildSchedule({ mode: 'equal', principal: 300_000, count: 3, firstDate: '2026-01-10' }).rows
    expect(rowsPayload(rows)[0]).toEqual({ seq: 1, due_date: '2026-01-10', due_paise: 100_000, principal_paise: 100_000, interest_paise: 0 })
    expect(rowsFull(rows)[0]).toMatchObject({ paid_paise: 0, paid_on: null })
  })
  it('property: payload rows sum to the total, are positive and increase in date', () => {
    fc.assert(fc.property(fc.integer({ min: 1_000, max: 9_000_000 }), fc.integer({ min: 1, max: 24 }), fc.constantFrom('equal', 'weekly', 'emi', 'nocost'), (principal, count, mode) => {
      const r = planPreview({ mode, principal, count, firstDate: '2026-01-31', rateBps: 1200 })
      if (!r.ok) return
      const rows = rowsPayload(r.preview.rows)
      expect(rows.reduce((s, x) => s + x.due_paise, 0)).toBe(r.preview.totalPayable)
      expect(rows.reduce((s, x) => s + x.principal_paise, 0)).toBe(principal)
      expect(rows.every((x) => x.due_paise > 0 && x.principal_paise + x.interest_paise === x.due_paise)).toBe(true)
      expect(rows.every((x, i) => i === 0 || (rows[i - 1] as { due_date: string }).due_date < x.due_date)).toBe(true)
    }))
  })
})

describe('diffRows / lastOpenDate (previews of plan edits)', () => {
  const rows = buildSchedule({ mode: 'equal', principal: 400_000, count: 4, firstDate: '2026-01-31' }).rows
  it('skip moves the chosen and later rows', () => {
    expect(diffRows(rows, skipPeriod(rows, 3))).toEqual([
      { kind: 'moved', seq: 3, from: '2026-03-31', to: '2026-04-30' },
      { kind: 'moved', seq: 4, from: '2026-04-30', to: '2026-05-31' },
    ])
  })
  it('change amount lists the rows whose amount changes', () => {
    expect(diffRows(rows, changeAmount(rows, 1, 130_000)).map((c) => c.kind)).toEqual(['amount', 'amount', 'amount', 'amount'])
  })
  it('extra payment removes rows and completes part-paid ones', () => {
    const part = [{ ...rows[0]!, paid_paise: 40_000 }, ...rows.slice(1)]
    const all = diffRows(part, addExtraPayment(part, 360_000, '2026-02-01').rows)
    expect(all.filter((c) => c.kind === 'removed').map((c) => c.seq)).toEqual([2, 3, 4])
    expect(all).toContainEqual({ kind: 'completed', seq: 1, paid_paise: 40_000 })
    const some = diffRows(part, addExtraPayment(part, 150_000, '2026-02-01').rows)
    expect(some.filter((c) => c.kind === 'removed').map((c) => c.seq)).toEqual([4])
    expect(some).toContainEqual({ kind: 'amount', seq: 3, from: 100_000, to: 50_000 })
  })
  it('lastOpenDate is the last row that still owes something', () => {
    expect(lastOpenDate(rows)).toBe('2026-04-30')
    expect(lastOpenDate(rows.map((r) => ({ ...r, paid_paise: r.due_paise })))).toBeNull()
    expect(lastOpenDate([{ ...rows[3]!, paid_paise: rows[3]!.due_paise }, ...rows.slice(0, 3)])).toBe('2026-03-31')
  })
})
