import { formatMoney, parseAmountExpression, parseRupees, type Paise } from '@/lib/money'

export interface AmountInput {
  /** Evaluated paise, or null if the text is empty or invalid. */
  paise: Paise | null
  /** True when the text is a calculation such as "450+120". */
  isExpression: boolean
  /** "= ₹570" style preview, only shown for expressions. */
  preview: string | null
}

/** Plain amounts ("450", "1,234.50") parse directly; anything else is tried as an expression. */
export function evaluateAmount(text: string): AmountInput {
  const t = text.trim()
  if (!t) return { paise: null, isExpression: false, preview: null }
  const plain = parseRupees(t)
  if (plain !== null) return { paise: plain, isExpression: false, preview: null }
  const expr = parseAmountExpression(t)
  return expr === null
    ? { paise: null, isExpression: false, preview: null }
    : { paise: expr, isExpression: true, preview: `= ${formatMoney(expr, { paise: 'auto' })}` }
}
