import { useUi } from '@/lib/uiStore'
import { useTabFilters } from './useTabFilters'

/** Home filters live in the URL at "/" (the month comes from the month switcher). */
export function useHomeFilters() {
  const stored = useUi((s) => s.homeSearch)
  const setStored = useUi((s) => s.setHomeSearch)
  return useTabFilters('/', stored, setStored)
}
