import { describe, expect, it } from 'vitest'
import { queryClient } from './queryClient'

describe('queryClient defaults', () => {
  it('writes fail fast when offline instead of pausing until a connection returns (a paused save is lost if the app closes)', () => {
    expect(queryClient.getDefaultOptions().mutations?.networkMode).toBe('always')
  })
  it('reads keep their cache for a week and revalidate on focus', () => {
    const q = queryClient.getDefaultOptions().queries
    expect(q?.gcTime).toBe(7 * 24 * 60 * 60 * 1000)
    expect(q?.refetchOnWindowFocus).toBe(true)
  })
})
