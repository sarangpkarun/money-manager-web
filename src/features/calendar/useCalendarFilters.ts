import { useTabFilters } from '@/features/home/useTabFilters'
import { useUi } from '@/lib/uiStore'

/** Calendar filters live in the URL at "/calendar". They apply to the Spending layer and the totals, never to dues or notes. */
export function useCalendarFilters() {
  const stored = useUi((s) => s.calendarSearch)
  const setStored = useUi((s) => s.setCalendarSearch)
  return useTabFilters('/calendar', stored, setStored)
}
