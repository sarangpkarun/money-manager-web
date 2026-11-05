import { describe, expect, it } from 'vitest'
import { pendingBadge, yourShare } from './rowText'

const o = (name: string | null, pending: number) => ({ entry_id: name ?? 'x', person_id: 'p', person_name: name, amount_paise: 3_000_000, pending_paise: pending })

describe('pendingBadge', () => {
  it('one friend', () => expect(pendingBadge([o('Arun', 2_000_000)])).toBe('₹20,000 pending from Arun'))
  it('several: total of what is pending and "+N more"', () => expect(pendingBadge([o('Arun', 100_000), o('Meera', 250_000), o('Ravi', 0)])).toBe('₹3,500 pending from Arun +1 more'))
  it('settled friends are not counted', () => expect(pendingBadge([o('Arun', 0), o('Meera', 50_000)])).toBe('₹500 pending from Meera'))
  it('nothing pending, none, or older cached rows', () => {
    expect(pendingBadge([o('Arun', 0)])).toBeNull()
    expect(pendingBadge([])).toBeNull()
    expect(pendingBadge(null)).toBeNull()
    expect(pendingBadge(undefined)).toBeNull()
  })
  it('a friend without a name', () => expect(pendingBadge([o(null, 100)])).toBe('₹1 pending from someone'))
})

describe('yourShare', () => {
  it('is the amount minus what was for others', () => {
    expect(yourShare({ amount_paise: 500_000, for_other_paise: 400_000 })).toBe(100_000)
    expect(yourShare({ amount_paise: 3_000_000, for_other_paise: 3_000_000 })).toBe(0)
    expect(yourShare({ amount_paise: 100, for_other_paise: 0 })).toBe(100)
  })
})
