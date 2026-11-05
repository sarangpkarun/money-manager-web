import { PALETTE } from '@/lib/palette'

export function Swatches({ value, onChange, label = 'Colour' }: { value: string; onChange: (c: string) => void; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {PALETTE.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={c} onClick={() => onChange(c)}
                className={`h-11 w-11 rounded-full border-2 transition-transform active:scale-90 ${value === c ? 'border-fg' : 'border-transparent'}`}
                style={{ background: c }} />
      ))}
    </div>
  )
}
