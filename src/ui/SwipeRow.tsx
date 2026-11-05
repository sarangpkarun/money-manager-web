import { useRef, useState, type ReactNode } from 'react'
import { useDrag } from '@use-gesture/react'

export type SwipeDecision = 'right' | 'left' | null

/** A swipe commits when dragged past the threshold in either direction. */
export function decideSwipe(dx: number, threshold = 80): SwipeDecision {
  return dx >= threshold ? 'right' : dx <= -threshold ? 'left' : null
}

interface SwipeRowProps {
  children: ReactNode
  /** Swipe right (e.g. edit). */
  onSwipeRight?: () => void
  /** Swipe left (e.g. delete, usually with Undo). */
  onSwipeLeft?: () => void
  rightLabel?: string
  leftLabel?: string
}

/**
 * Horizontal swipe actions. Vertical scrolling stays native (touch-action: pan-y); only transform animates.
 * Swipe actions must also exist as buttons elsewhere (the row's detail sheet) for accessibility.
 */
export function SwipeRow({ children, onSwipeRight, onSwipeLeft, rightLabel = 'Edit', leftLabel = 'Delete' }: SwipeRowProps) {
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const swiped = useRef(false)

  const bind = useDrag(
    ({ movement: [mx], active, last, cancel, event }) => {
      if (active && Math.abs(mx) > 8) event.stopPropagation()
      const allowed = (mx > 0 && onSwipeRight) || (mx < 0 && onSwipeLeft)
      if (!allowed) { if (active) cancel(); return }
      setDragging(active)
      setDx(active ? Math.max(-140, Math.min(140, mx)) : 0)
      if (last) {
        const d = decideSwipe(mx)
        swiped.current = d !== null
        if (d === 'right') onSwipeRight?.()
        if (d === 'left') onSwipeLeft?.()
      }
    },
    { axis: 'x', filterTaps: true, pointer: { touch: true }, threshold: 8 },
  )

  return (
    <div className="relative overflow-hidden">
      <div aria-hidden className="absolute inset-0 flex items-center justify-between px-4 text-sm font-semibold text-white">
        <span className={`rounded-lg bg-accent px-3 py-2 ${dx > 0 ? 'opacity-100' : 'opacity-0'}`}>{rightLabel}</span>
        <span className={`rounded-lg bg-money-red px-3 py-2 ${dx < 0 ? 'opacity-100' : 'opacity-0'}`}>{leftLabel}</span>
      </div>
      <div
        {...bind()}
        style={{ transform: `translateX(${dx}px)`, transition: dragging ? 'none' : 'transform 180ms ease-out', touchAction: 'pan-y' }}
        className="relative bg-surface"
      >
        {children}
      </div>
    </div>
  )
}
