/** Wall-clock time in a named time zone <-> instants, without a date library. */

const parts = (ms: number, tz: string) => {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const o: Record<string, number> = {}
  for (const p of f.formatToParts(new Date(ms))) if (p.type !== 'literal') o[p.type] = Number(p.value)
  return o as { year: number; month: number; day: number; hour: number; minute: number; second: number }
}

/** Milliseconds the zone is ahead of UTC at instant `ms` (e.g. +19_800_000 for Asia/Kolkata). */
const offsetAt = (ms: number, tz: string): number => {
  const p = parts(ms, tz)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000
}

/**
 * The instant (ISO, UTC) at which the wall clock in `tz` shows `date` ("yyyy-MM-dd") and `hm` ("HH:mm"). A time that does not exist
 * (spring-forward gap) lands just after the gap; a repeated time (autumn) picks the first occurrence.
 */
export function localToInstant(date: string, hm: string, tz: string): string {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number]
  const [h, mi] = hm.split(':').map(Number) as [number, number]
  const wall = Date.UTC(y, mo - 1, d, h, mi, 0)
  let guess = wall - offsetAt(wall, tz)
  guess = wall - offsetAt(guess, tz)
  // if the corrected instant does not display the requested wall time, we fell in a gap: step forward past it
  const back = parts(guess, tz)
  if (Date.UTC(back.year, back.month - 1, back.day, back.hour, back.minute, 0) !== wall) guess = wall - offsetAt(wall + 3_600_000, tz)
  return new Date(guess).toISOString()
}

/** The wall-clock "HH:mm" of an instant in `tz`. */
export function instantToHm(iso: string, tz: string): string {
  const p = parts(new Date(iso).getTime(), tz)
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

/** The wall-clock date "yyyy-MM-dd" of an instant in `tz`. */
export function instantToDate(iso: string, tz: string): string {
  const p = parts(new Date(iso).getTime(), tz)
  return `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}
