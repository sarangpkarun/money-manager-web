import { useMemo } from 'react'
import { todayIn } from '@/lib/today'
import { useProfile } from './useProfile'

const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

/** Today's date in the user's timezone (falls back to the device's until the profile loads). */
export function useToday(): string {
  const { data } = useProfile()
  const tz = data?.timezone ?? browserZone()
  return useMemo(() => todayIn(tz), [tz])
}

export function useWeekStart(): 0 | 1 {
  const { data } = useProfile()
  return data?.week_starts_on === 0 ? 0 : 1
}
