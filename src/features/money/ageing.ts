import type { Ageing } from './types'

export interface AgeingBar { key: keyof Ageing; label: string; paise: number; fraction: number; late: boolean }

const LABELS: [keyof Ageing, string][] = [['current', 'Not due'], ['d1_30', '1–30 days late'], ['d31_60', '31–60 days late'], ['d61_plus', '61+ days late']]

/** Bars for the ageing buckets, as fractions of the largest bucket. */
export function ageingBars(a: Ageing): AgeingBar[] {
  const max = Math.max(a.current, a.d1_30, a.d31_60, a.d61_plus, 0)
  return LABELS.map(([key, label]) => ({ key, label, paise: a[key], fraction: max > 0 ? a[key] / max : 0, late: key !== 'current' }))
}

export const ageingTotal = (a: Ageing): number => a.current + a.d1_30 + a.d31_60 + a.d61_plus
