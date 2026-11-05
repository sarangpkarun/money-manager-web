import { donutArcs } from './geometry'

const R = 42
const C = 2 * Math.PI * R

/** Ring chart. Decorative: the ranked list next to it carries the same numbers for screen readers. */
export function Donut({ values, colors, label, centre }: { values: number[]; colors: string[]; label: string; centre?: React.ReactNode }) {
  const arcs = donutArcs(values, C)
  return (
    <div className="relative mx-auto h-36 w-36 shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" role="img" aria-label={label}>
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="12" />
        {arcs.map((a, i) => (
          <circle key={i} cx="50" cy="50" r={R} fill="none" stroke={colors[i] ?? '#64748b'} strokeWidth="12"
                  strokeDasharray={`${a.dash} ${a.gap}`} strokeDashoffset={a.offset} />
        ))}
      </svg>
      {centre && <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">{centre}</div>}
    </div>
  )
}
