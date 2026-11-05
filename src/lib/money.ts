/** Money is a whole number of paise (1 rupee = 100 paise). Never use floats for stored amounts. */
export type Paise = number

export function assertPaise(n: number, label = 'amount'): Paise {
  if (!Number.isSafeInteger(n)) throw new RangeError(`${label} must be a safe integer number of paise, got ${n}`)
  return n
}

/** Parses "1,234.50", "₹1,234", "-50", ".5" into paise. Returns null if invalid or more than 2 decimals. */
export function parseRupees(input: string): Paise | null {
  let s = input.trim()
  let sign = 1
  if (s.startsWith('-')) {
    sign = -1
    s = s.slice(1).trim()
  } else if (s.startsWith('+')) s = s.slice(1).trim()
  s = s.replace(/^₹\s*/, '').replace(/,/g, '').replace(/\s+/g, '')
  const m = /^(\d*)(?:\.(\d{0,2}))?$/.exec(s)
  if (!m || (m[1] === '' && !m[2])) return null
  const paise = Number(m[1] || '0') * 100 + Number((m[2] ?? '').padEnd(2, '0'))
  return Number.isSafeInteger(paise) ? sign * paise || 0 : null
}

// ---- amount expressions: "450+120", "(1200-200)/4", "-30*2" -------------------------------------
// Values are paise. a*b and a/b use BigInt so intermediates cannot lose precision; results round half away from zero.

type Tok = { t: 'num'; v: bigint } | { t: 'op'; v: '+' | '-' | '*' | '/' | '(' | ')' }

function tokenize(src: string): Tok[] | null {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i] as string
    if (/\s/.test(c)) {
      i++
      continue
    }
    const num = /^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})/.exec(src.slice(i))
    if (num) {
      const [w = '', f = ''] = num[0].split('.')
      out.push({ t: 'num', v: BigInt(w || '0') * 100n + BigInt(f.padEnd(2, '0')) })
      i += num[0].length
      continue
    }
    if ('+-*/×÷x()'.includes(c)) {
      const op = c === '×' || c === 'x' ? '*' : c === '÷' ? '/' : c
      out.push({ t: 'op', v: op as '+' | '-' | '*' | '/' | '(' | ')' })
      i++
      continue
    }
    return null
  }
  return out
}

const divRound = (n: bigint, d: bigint): bigint => {
  const neg = n < 0n !== d < 0n
  const an = n < 0n ? -n : n
  const ad = d < 0n ? -d : d
  const q = (2n * an + ad) / (2n * ad) // round half up on magnitudes
  return neg ? -q : q
}

export function parseAmountExpression(src: string): Paise | null {
  const toks = tokenize(src)
  if (!toks || toks.length === 0) return null
  let pos = 0
  const peek = () => toks[pos]
  const isOp = (t: Tok | undefined, v: string) => t?.t === 'op' && t.v === v

  const expr = (): bigint | null => {
    let left = term()
    while (left !== null && (isOp(peek(), '+') || isOp(peek(), '-'))) {
      const plus = (toks[pos++] as { v: string }).v === '+'
      const right = term()
      if (right === null) return null
      left = plus ? left + right : left - right
    }
    return left
  }
  const term = (): bigint | null => {
    let left = factor()
    while (left !== null && (isOp(peek(), '*') || isOp(peek(), '/'))) {
      const mul = (toks[pos++] as { v: string }).v === '*'
      const right = factor()
      if (right === null) return null
      if (mul) left = divRound(left * right, 100n)
      else if (right === 0n) return null
      else left = divRound(left * 100n, right)
    }
    return left
  }
  const factor = (): bigint | null => {
    const t = toks[pos]
    if (!t) return null
    if (t.t === 'num') {
      pos++
      return t.v
    }
    if (isOp(t, '-')) {
      pos++
      const v = factor()
      return v === null ? null : -v
    }
    if (isOp(t, '(')) {
      pos++
      const v = expr()
      if (v === null || !isOp(peek(), ')')) return null
      pos++
      return v
    }
    return null
  }

  const result = expr()
  if (result === null || pos !== toks.length) return null
  const n = Number(result)
  return Number.isSafeInteger(n) ? n : null
}

// ---- formatting -------------------------------------------------------------------------------------

export interface FormatOptions {
  format?: 'indian' | 'western'
  /** auto: show paise only when non-zero. */
  paise?: 'auto' | 'always' | 'never'
  symbol?: boolean
}

export function groupDigits(digits: string, format: 'indian' | 'western'): string {
  if (digits.length <= 3) return digits
  if (format === 'western') return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const head = digits.slice(0, -3)
  return `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${digits.slice(-3)}`
}

export function formatMoney(paise: Paise, opts: FormatOptions = {}): string {
  const { format = 'indian', paise: mode = 'auto', symbol = true } = opts
  assertPaise(paise)
  const abs = Math.abs(paise)
  const rupees = Math.floor(abs / 100)
  const rem = abs % 100
  const showPaise = mode === 'always' || (mode === 'auto' && rem !== 0)
  const body = groupDigits(String(rupees), format) + (showPaise ? `.${String(rem).padStart(2, '0')}` : '')
  return `${paise < 0 ? '-' : ''}${symbol ? '₹' : ''}${body}`
}

/** round(a * b / c) for a, b >= 0 and c > 0, exact via BigInt (half rounds up). Use for rates/percentages. */
export function mulDiv(a: number, b: number, c: number): Paise {
  assertPaise(a)
  if (a < 0 || b < 0 || !Number.isSafeInteger(b) || !Number.isSafeInteger(c) || c <= 0)
    throw new RangeError('mulDiv needs non-negative safe integers and a positive divisor')
  const r = divRound(BigInt(a) * BigInt(b), BigInt(c))
  return assertPaise(Number(r))
}
