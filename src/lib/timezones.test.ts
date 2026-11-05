import { describe, expect, it, vi } from 'vitest'
import { deviceTimeZone, listTimeZones, searchTimeZones } from './timezones'

describe('listTimeZones', () => {
  it('is sorted, unique, and always has UTC and Asia/Kolkata', () => {
    const z = listTimeZones()
    expect(z).toContain('UTC')
    expect(z).toContain('Asia/Kolkata')
    expect(z).toEqual([...new Set(z)].sort())
  })
  it('falls back to a short list when the browser cannot enumerate zones', () => {
    const orig = (Intl as unknown as { supportedValuesOf?: unknown }).supportedValuesOf
    ;(Intl as unknown as { supportedValuesOf?: unknown }).supportedValuesOf = () => { throw new Error('nope') }
    expect(listTimeZones()).toContain('America/New_York')
    ;(Intl as unknown as { supportedValuesOf?: unknown }).supportedValuesOf = orig
  })
})

describe('deviceTimeZone', () => {
  it('returns the resolved zone, or null if unavailable', () => {
    expect(typeof deviceTimeZone()).toBe('string')
    const spy = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => { throw new Error('x') })
    expect(deviceTimeZone()).toBeNull()
    spy.mockRestore()
  })
})

describe('searchTimeZones', () => {
  const zones = ['America/New_York', 'America/Los_Angeles', 'Asia/Kolkata', 'Asia/Kathmandu', 'Europe/London', 'UTC']
  it('empty query: the first few, in order', () => expect(searchTimeZones(zones, '', 2)).toEqual(['America/New_York', 'America/Los_Angeles']))
  it('matches anywhere, ignoring case, slashes and underscores', () => {
    expect(searchTimeZones(zones, 'new york')).toEqual(['America/New_York'])
    expect(searchTimeZones(zones, 'KOL')).toEqual(['Asia/Kolkata'])
    expect(searchTimeZones(zones, 'asia/ka')).toEqual(['Asia/Kathmandu'])
    expect(searchTimeZones(zones, 'asia/k')).toEqual(['Asia/Kathmandu', 'Asia/Kolkata'])
  })
  it('best (prefix) matches first; nothing found is an empty list', () => {
    expect(searchTimeZones(zones, 'a')[0]).toBe('America/Los_Angeles')
    expect(searchTimeZones(zones, 'zzz')).toEqual([])
    expect(searchTimeZones(zones, 'a', 3)).toHaveLength(3)
  })
})
