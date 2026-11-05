import { describe, expect, it } from 'vitest'
import { tabForPath } from '@/app/Shell'

describe('tabForPath', () => {
  it('maps known paths', () => {
    expect(tabForPath('/')).toBe('home')
    expect(tabForPath('/calendar')).toBe('calendar')
    expect(tabForPath('/activity')).toBe('activity')
    expect(tabForPath('/money')).toBe('money')
  })
  it('returns null for unknown paths (shell redirects home)', () => {
    expect(tabForPath('/nope')).toBeNull()
  })
})
