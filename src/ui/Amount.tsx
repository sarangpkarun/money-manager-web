import { formatMoney } from '@/lib/money'

export type AmountTone = 'in' | 'out' | 'neutral'

const TONE: Record<AmountTone, string> = { in: 'text-money-green', out: 'text-money-red', neutral: 'text-fg' }

/** Rupee amount with tabular numerals. `sign` prefixes + / − for in/out rows. */
export function Amount({ paise, tone = 'neutral', sign = false, className = '' }: { paise: number; tone?: AmountTone; sign?: boolean; className?: string }) {
  const prefix = sign ? (tone === 'in' ? '+' : tone === 'out' ? '−' : '') : ''
  return <span className={`tabular ${TONE[tone]} ${className}`}>{prefix}{formatMoney(Math.abs(paise))}</span>
}
