import { assertPaise, type Paise } from './money'

export interface EmiRow {
  due: Paise
  principal: Paise
  interest: Paise
}

/** Amount financed = price - down payment. */
export function financedAmount(price: Paise, down: Paise): Paise {
  assertPaise(price)
  assertPaise(down)
  if (down < 0 || down >= price) throw new RangeError('Down payment must be at least 0 and less than the price')
  return price - down
}

const monthlyRate = (rateBps: number) => rateBps / 120_000 // % p.a. x100 -> monthly fraction

/** EMI = P*r*(1+r)^n / ((1+r)^n - 1), written as P*r / (1 - (1+r)^-n) with expm1/log1p for accuracy. Rounded to whole paise. */
export function reducingEmi(principal: Paise, rateBps: number, months: number): Paise {
  assertPaise(principal)
  if (!Number.isInteger(months) || months < 1) throw new RangeError('months must be a positive integer')
  if (rateBps < 0) throw new RangeError('rate cannot be negative')
  if (rateBps === 0) return Math.round(principal / months)
  const r = monthlyRate(rateBps)
  return Math.round((principal * r) / -Math.expm1(-months * Math.log1p(r)))
}

/** Reducing-balance rows. Each row's interest = round(balance * r); the last row clears the balance exactly. */
export function reducingRows(principal: Paise, rateBps: number, months: number): EmiRow[] {
  const emi = reducingEmi(principal, rateBps, months)
  const r = monthlyRate(rateBps)
  const rows: EmiRow[] = []
  let balance = principal
  for (let i = 1; i <= months; i++) {
    const interest = Math.round(balance * r)
    if (i === months) {
      rows.push({ due: balance + interest, principal: balance, interest })
      break
    }
    const p = Math.min(Math.max(emi - interest, 0), balance)
    rows.push({ due: p + interest, principal: p, interest })
    balance -= p
  }
  return rows
}

/** No-cost EMI: the seller absorbs the interest, so the buyer repays the financed amount only. */
export function noCostEmi(financed: Paise, months: number): Paise {
  assertPaise(financed)
  if (!Number.isInteger(months) || months < 1) throw new RangeError('months must be a positive integer')
  return Math.floor(financed / months)
}
