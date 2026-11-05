import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { assertPaise, formatMoney, groupDigits, parseAmountExpression, parseRupees } from './money'

describe('assertPaise', () => {
  it('accepts integers, rejects fractions and unsafe values', () => {
    expect(assertPaise(1050)).toBe(1050)
    expect(() => assertPaise(10.5)).toThrow(RangeError)
    expect(() => assertPaise(Number.MAX_SAFE_INTEGER + 2)).toThrow()
    expect(() => assertPaise(NaN, 'total')).toThrow(/total/)
  })
})

describe('parseRupees', () => {
  it.each([
    ['450', 45000], ['1,234.50', 123450], ['₹1,234', 123400], ['₹ 99.9', 9990], ['.5', 50], ['5.', 500],
    ['-50', -5000], ['-₹1,00,000', -10000000], ['+7', 700], ['  12.05  ', 1205], ['0', 0], ['-0', 0],
  ])('parses %s', (input, expected) => expect(parseRupees(input)).toBe(expected))

  it.each(['', '.', '-', 'abc', '1.234', '1..2', '12a', '₹', '--5'])('rejects %j', (input) =>
    expect(parseRupees(input)).toBeNull())

  it('rejects amounts beyond the safe range', () => expect(parseRupees('9'.repeat(30))).toBeNull())
})

describe('parseAmountExpression', () => {
  it.each([
    ['450+120', 57000], ['450 + 120', 57000], ['100-30.50', 6950], ['12*3', 3600], ['10/4', 250],
    ['2+3*4', 1400], ['(2+3)*4', 2000], ['-5+2', -300], ['-(2+3)', -500], ['1200/3', 40000],
    ['10×3', 3000], ['9÷3', 300], ['3x4', 1200], ['0.10*0.10', 1], ['1/3', 33], ['2/3', 67], ['.5+.5', 100],
  ])('%s = %i paise', (src, expected) => expect(parseAmountExpression(src)).toBe(expected))

  it.each(['', '  ', '+', '1+', '*2', '(1+2', '1+2)', '1/0', 'abc', '1 2', '1.234+1', '()', '1++'])(
    'rejects %j', (src) => expect(parseAmountExpression(src)).toBeNull())

  it('rounds half away from zero for negatives too', () => {
    expect(parseAmountExpression('-1/3')).toBe(-33)
    expect(parseAmountExpression('-2/3')).toBe(-67)
    expect(parseAmountExpression('1/-3')).toBe(-33)
  })

  it('rejects results beyond the safe range', () =>
    expect(parseAmountExpression('99999999999999*99999999999999')).toBeNull())

  it('adds two amounts exactly', () => {
    const plain = (p: number) => formatMoney(p, { symbol: false, paise: 'always', format: 'western' }).replace(/,/g, '')
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1e9 }), fc.integer({ min: 0, max: 1e9 }), (a, b) =>
        parseAmountExpression(`${plain(a)}+${plain(b)}`) === a + b,
      ),
    )
  })
})

describe('groupDigits', () => {
  it('indian grouping', () => {
    expect(groupDigits('1', 'indian')).toBe('1')
    expect(groupDigits('999', 'indian')).toBe('999')
    expect(groupDigits('1000', 'indian')).toBe('1,000')
    expect(groupDigits('100000', 'indian')).toBe('1,00,000')
    expect(groupDigits('1234567', 'indian')).toBe('12,34,567')
    expect(groupDigits('123456789', 'indian')).toBe('12,34,56,789')
  })
  it('western grouping', () => {
    expect(groupDigits('1234567', 'western')).toBe('1,234,567')
    expect(groupDigits('123', 'western')).toBe('123')
  })
})

describe('formatMoney', () => {
  it('whole rupees unless paise are non-zero', () => {
    expect(formatMoney(123400)).toBe('₹1,234')
    expect(formatMoney(123450)).toBe('₹1,234.50')
    expect(formatMoney(5)).toBe('₹0.05')
    expect(formatMoney(0)).toBe('₹0')
  })
  it('paise modes', () => {
    expect(formatMoney(123400, { paise: 'always' })).toBe('₹1,234.00')
    expect(formatMoney(123450, { paise: 'never' })).toBe('₹1,234')
  })
  it('indian vs western, symbol, negatives', () => {
    expect(formatMoney(123456700)).toBe('₹12,34,567')
    expect(formatMoney(123456700, { format: 'western' })).toBe('₹1,234,567')
    expect(formatMoney(-150000)).toBe('-₹1,500')
    expect(formatMoney(150000, { symbol: false })).toBe('1,500')
  })
  it('rejects non-integers', () => expect(() => formatMoney(1.5)).toThrow(RangeError))

  it('format -> parse round-trips for any safe amount', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1e12, max: 1e12 }), fc.constantFrom('indian', 'western'), (p, format) =>
        parseRupees(formatMoney(p, { format, paise: 'always' })) === p,
      ),
    )
  })
})
