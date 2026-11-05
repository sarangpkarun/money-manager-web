const FALLBACK = [
  'UTC', 'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Karachi', 'Asia/Dhaka', 'Asia/Kathmandu', 'Asia/Colombo', 'Europe/London', 'Europe/Paris',
  'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Toronto', 'Australia/Sydney', 'Pacific/Auckland', 'Africa/Johannesburg',
]

/** IANA time zone names the browser knows (a short list where it cannot tell us), always including UTC and Asia/Kolkata. */
export function listTimeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
  const names = (() => { try { return intl.supportedValuesOf?.('timeZone') ?? [] } catch { return [] } })()
  return [...new Set([...(names.length ? names : FALLBACK), 'UTC', 'Asia/Kolkata'])].sort()
}

/** The device's own time zone, or null when the browser will not say. */
export function deviceTimeZone(): string | null {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null } catch { return null }
}

/** Zones matching what was typed (case-insensitive, "_" and "/" treated as spaces), best matches first, at most `limit`. */
export function searchTimeZones(zones: string[], query: string, limit = 40): string[] {
  const norm = (s: string) => s.toLowerCase().replace(/[_/]/g, ' ')
  const q = norm(query.trim())
  if (!q) return zones.slice(0, limit)
  return zones.map((z) => [z, norm(z)] as const)
    .filter(([, n]) => n.includes(q))
    .sort((a, b) => Number(b[1].startsWith(q)) - Number(a[1].startsWith(q)) || a[0].localeCompare(b[0]))
    .slice(0, limit).map(([z]) => z)
}
