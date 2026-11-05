import { describe, expect, it } from 'vitest'
import { qk } from './queryKeys'

describe('query keys', () => {
  it('parameterised keys carry their parameters, so different inputs never share a cache entry', () => {
    expect(qk.profile('u1')).toEqual(['profile', 'u1'])
    expect(qk.activityList({ a: 1 })).toEqual(['activity', { a: 1 }])
    expect(qk.summary({ a: 1 })).toEqual(['activity-summary', { a: 1 }])
    expect(qk.dashboard('2026-11', { x: 1 })).toEqual(['dashboard', '2026-11', { x: 1 }])
    expect(qk.suggestions('lun')).toEqual(['title-suggestions', 'lun'])
    expect(qk.moneyOverview('2026-11-15')).toEqual(['money', 'overview', '2026-11-15'])
    expect(qk.entry('e1')).toEqual(['money', 'entry', 'e1'])
    expect(qk.calendarMonth('2026-11', { a: 1 })).toEqual(['calendar', 'month', '2026-11', { a: 1 }])
  })
  it('list keys are prefixes of their detail keys, so one invalidation refreshes both', () => {
    expect(qk.activityList({})[0]).toBe(qk.activity[0])
    expect(qk.dashboard('2026-11', {})[0]).toBe(qk.dashboardAll[0])
    expect(qk.moneyOverview('d')[0]).toBe(qk.money[0])
    expect(qk.moneyHistory[0]).toBe(qk.money[0])
    expect(qk.entry('e')[0]).toBe(qk.money[0])
    expect(qk.calendarMonth('m', {})[0]).toBe(qk.calendarAll[0])
    expect(qk.agenda[0]).toBe(qk.calendarAll[0])
  })
})
