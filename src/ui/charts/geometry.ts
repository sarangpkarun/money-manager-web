export interface DonutArc { dash: number; gap: number; offset: number }

/** Stroke-dash segments for a donut of circumference `c` (SVG circle, rotated -90deg so it starts at 12 o'clock). */
export function donutArcs(values: number[], c: number, gapPx = 2): DonutArc[] {
  const total = values.reduce((s, v) => s + v, 0)
  if (total <= 0) return []
  const gap = values.filter((v) => v > 0).length > 1 ? gapPx : 0
  let acc = 0
  return values.map((v) => {
    const len = (v / total) * c
    const arc = { dash: Math.max(len - gap, 0), gap: c - Math.max(len - gap, 0), offset: -acc }
    acc += len
    return arc
  })
}

export interface SparkPoint { x: number; y: number }
export interface Spark { line: string; area: string; avgY: number | null; points: SparkPoint[] }

/** Line/area paths for a series in a `w` x `h` box with `pad` inside. Flat or empty series sit on the baseline. */
export function sparkline(values: number[], w: number, h: number, pad = 4, avg: number | null = null): Spark {
  const max = Math.max(...values, avg ?? 0, 0)
  const inner = { w: w - pad * 2, h: h - pad * 2 }
  const x = (i: number) => pad + (values.length <= 1 ? inner.w / 2 : (i * inner.w) / (values.length - 1))
  const y = (v: number) => pad + inner.h - (max <= 0 ? 0 : (v / max) * inner.h)
  const points = values.map((v, i) => ({ x: x(i), y: y(v) }))
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('')
  const first = points[0], last = points[points.length - 1]
  const area = first && last ? `${line}L${last.x.toFixed(1)} ${(pad + inner.h).toFixed(1)}L${first.x.toFixed(1)} ${(pad + inner.h).toFixed(1)}Z` : ''
  return { line, area, avgY: avg === null ? null : y(avg), points }
}

/** Index of the point nearest an x position (for the scrubber). */
export function nearestIndex(points: SparkPoint[], x: number): number {
  let best = 0
  points.forEach((p, i) => { if (Math.abs(p.x - x) < Math.abs((points[best]?.x ?? 0) - x)) best = i })
  return best
}

/** Bar lengths as fractions (0..1) of the largest value. */
export const barFractions = (values: number[]): number[] => {
  const max = Math.max(...values, 0)
  return values.map((v) => (max > 0 ? v / max : 0))
}
