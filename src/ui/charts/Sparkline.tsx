import { useMemo, useRef, useState } from 'react'
import { formatMoney } from '@/lib/money'
import { nearestIndex, sparkline } from './geometry'

const W = 300
const H = 72

interface Props {
  values: number[]
  /** one label per value, e.g. "Wed, 5 Nov" */
  labels: string[]
  /** average line (paise), drawn dashed */
  average?: number | null
  label: string
}

/** Daily-spend line with a dashed average. Touch or drag to read a day's amount. */
export function Sparkline({ values, labels, average = null, label }: Props) {
  const s = useMemo(() => sparkline(values, W, H, 4, average), [values, average])
  const [active, setActive] = useState<number | null>(null)
  const ref = useRef<SVGSVGElement>(null)
  const move = (clientX: number) => {
    const box = ref.current?.getBoundingClientRect()
    if (!box || box.width === 0) return
    setActive(nearestIndex(s.points, ((clientX - box.left) / box.width) * W))
  }
  const p = active === null ? null : s.points[active]
  return (
    <div>
      <div className="h-5 text-xs text-muted" aria-live="polite">
        {active !== null ? `${labels[active]} · ${formatMoney(values[active] ?? 0)}` : ' '}
      </div>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="h-[72px] w-full touch-pan-y" role="img" aria-label={label}
           onPointerDown={(e) => move(e.clientX)} onPointerMove={(e) => e.buttons > 0 || e.pointerType === 'touch' ? move(e.clientX) : undefined}
           onPointerLeave={() => setActive(null)} onPointerUp={(e) => e.pointerType === 'touch' && setActive(null)}>
        {s.area && <path d={s.area} fill="var(--accent)" opacity="0.12" />}
        {s.avgY !== null && <line x1="0" x2={W} y1={s.avgY} y2={s.avgY} stroke="var(--muted)" strokeWidth="1" strokeDasharray="4 4" />}
        {s.line && <path d={s.line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
        {p && <circle cx={p.x} cy={p.y} r="4" fill="var(--accent)" />}
      </svg>
    </div>
  )
}
