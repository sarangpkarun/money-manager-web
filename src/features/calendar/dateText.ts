import type { DateStr } from '@/lib/dates'
import { formatDisplayDate } from '@/lib/display'

/** "5 Nov" (in the user's date format, without the year). */
export const shortDate = (date: DateStr): string => formatDisplayDate(date, { year: false })

/** "Thursday, 5 Nov 2026" (the day sheet title; never "Today", so it reads the same whenever it is opened). */
export const longDate = (date: DateStr): string => formatDisplayDate(date, { weekday: 'long' })
