/** Reminder settings as the form edits them (time inputs give "HH:MM"; the database returns "HH:MM:SS"). */
export interface ReminderForm {
  alarm: string
  quietOn: boolean
  quietFrom: string
  quietUntil: string
  summary: 'off' | 'daily' | 'weekly'
  summaryTime: string
  /** 0 = Sunday … 6 = Saturday */
  summaryWeekday: number
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

/** "09:00:00" -> "09:00". */
export const toHm = (t: string | null | undefined, fallback: string): string => (t ? t.slice(0, 5) : fallback)

export const isHm = (s: string): boolean => HHMM.test(s)

export const DEFAULT_REMINDERS: ReminderForm = { alarm: '09:00', quietOn: false, quietFrom: '22:00', quietUntil: '07:00', summary: 'off', summaryTime: '08:00', summaryWeekday: 1 }

export interface ProfileReminderRow {
  alarm_time: string | null
  quiet_from: string | null
  quiet_until: string | null
  summary_mode: string | null
  summary_time: string | null
  summary_weekday: number | null
}

export function formFromProfile(p: Partial<ProfileReminderRow> | null | undefined): ReminderForm {
  if (!p) return DEFAULT_REMINDERS
  const mode = p.summary_mode === 'daily' || p.summary_mode === 'weekly' ? p.summary_mode : 'off'
  return {
    alarm: toHm(p.alarm_time, '09:00'), quietOn: !!(p.quiet_from && p.quiet_until),
    quietFrom: toHm(p.quiet_from, '22:00'), quietUntil: toHm(p.quiet_until, '07:00'),
    summary: mode, summaryTime: toHm(p.summary_time, '08:00'), summaryWeekday: p.summary_weekday ?? 1,
  }
}

/** Errors keyed by field; empty object = valid. Quiet hours may wrap midnight (22:00 to 07:00), but cannot be empty (same start and end). */
export function validateReminders(f: ReminderForm): Record<string, string> {
  const e: Record<string, string> = {}
  if (!isHm(f.alarm)) e.alarm = 'Choose a time'
  if (f.quietOn) {
    if (!isHm(f.quietFrom)) e.quietFrom = 'Choose a time'
    if (!isHm(f.quietUntil)) e.quietUntil = 'Choose a time'
    if (!e.quietFrom && !e.quietUntil && f.quietFrom === f.quietUntil) e.quietUntil = 'Quiet hours need a start and an end that differ'
  }
  if (f.summary !== 'off') {
    if (!isHm(f.summaryTime)) e.summaryTime = 'Choose a time'
    if (f.summary === 'weekly' && !(Number.isInteger(f.summaryWeekday) && f.summaryWeekday >= 0 && f.summaryWeekday <= 6)) e.summaryWeekday = 'Choose a day'
  }
  return e
}

/** The `profiles` columns to write. */
export function profilePatch(f: ReminderForm) {
  return {
    alarm_time: f.alarm,
    quiet_from: f.quietOn ? f.quietFrom : null,
    quiet_until: f.quietOn ? f.quietUntil : null,
    summary_mode: f.summary,
    summary_time: f.summaryTime,
    summary_weekday: f.summary === 'weekly' ? f.summaryWeekday : null,
  }
}

const inQuiet = (t: string, from: string, until: string): boolean => (from < until ? t >= from && t < until : t >= from || t < until)

/**
 * Plain-words consequence of the settings, mirroring the server rules: an automatic reminder inside quiet hours waits until they end,
 * unless that would pass midnight, in which case it is skipped.
 */
export function alarmNote(f: ReminderForm): string | null {
  if (!f.quietOn || f.quietFrom === f.quietUntil || !isHm(f.alarm) || !inQuiet(f.alarm, f.quietFrom, f.quietUntil)) return null
  const waits = f.quietFrom < f.quietUntil || f.alarm < f.quietUntil
  return waits ? `${f.alarm} is inside quiet hours, so reminders will arrive at ${f.quietUntil} instead.` : `${f.alarm} is inside quiet hours and they last past midnight, so reminders would be skipped. Choose another time.`
}
