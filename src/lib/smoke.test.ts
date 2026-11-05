import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

describe('test setup', () => {
  it('runs property tests', () => {
    fc.assert(fc.property(fc.integer(), (n) => n + 0 === n))
    expect(true).toBe(true)
  })
})
