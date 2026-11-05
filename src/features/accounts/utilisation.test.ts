import { describe, expect, it } from 'vitest'
import { utilisationBps, utilisationTone } from './utilisation'

describe('utilisation', () => {
  it('basis points of the limit', () => {
    expect(utilisationBps(3_200_000, 10_000_000)).toBe(3200)
    expect(utilisationBps(0, 10_000_000)).toBe(0)
    expect(utilisationBps(15_000_000, 10_000_000)).toBe(15000)
  })
  it('null without a usable limit or outstanding', () => {
    expect(utilisationBps(100, null)).toBeNull()
    expect(utilisationBps(100, 0)).toBeNull()
    expect(utilisationBps(null, 1000)).toBeNull()
    expect(utilisationBps(undefined, 1000)).toBeNull()
  })
  it('tones', () => {
    expect(utilisationTone(2000)).toBe('green')
    expect(utilisationTone(3000)).toBe('green')
    expect(utilisationTone(3001)).toBe('amber')
    expect(utilisationTone(5000)).toBe('amber')
    expect(utilisationTone(5001)).toBe('red')
  })
})
