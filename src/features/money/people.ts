/** Case, spacing and punctuation-insensitive name used to spot duplicates ("R. Kumar" ~ "r kumar"). */
export const normaliseName = (s: string): string =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim()

export const normalisePhone = (s: string | null | undefined): string => (s ?? '').replace(/\D/g, '').slice(-10)

export interface PersonLike { id: string; name: string; phone?: string | null }

/** Groups of two or more people who share a normalised name or a phone number. */
export function findDuplicates<T extends PersonLike>(people: T[]): T[][] {
  const parent = new Map<string, string>(people.map((p) => [p.id, p.id]))
  const find = (x: string): string => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; return r }
  const union = (a: string, b: string) => { parent.set(find(a), find(b)) }
  const seen = new Map<string, string>()
  for (const p of people) {
    for (const key of [`n:${normaliseName(p.name)}`, normalisePhone(p.phone).length >= 7 ? `p:${normalisePhone(p.phone)}` : '']) {
      if (!key || key === 'n:') continue
      const prev = seen.get(key)
      if (prev) union(prev, p.id)
      else seen.set(key, p.id)
    }
  }
  const groups = new Map<string, T[]>()
  for (const p of people) groups.set(find(p.id), [...(groups.get(find(p.id)) ?? []), p])
  return [...groups.values()].filter((g) => g.length > 1)
}

export interface ImportRow { name: string; phone: string | null; duplicate: boolean }

/**
 * Parses pasted text or a CSV: one person per line, "name" or "name, phone" (comma, semicolon or tab). A header row such as
 * "name,phone" is skipped. Lines whose name (or phone) already exists, or repeats earlier in the paste, are marked duplicate.
 */
export function parsePeopleText(text: string, existing: PersonLike[]): ImportRow[] {
  const names = new Set(existing.map((p) => normaliseName(p.name)))
  const phones = new Set(existing.map((p) => normalisePhone(p.phone)).filter((p) => p.length >= 7))
  const out: ImportRow[] = []
  text.split(/\r?\n/).forEach((line, i) => {
    const cells = line.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, '').trim())
    const name = cells[0] ?? ''
    if (!name) return
    if (i === 0 && /^(name|person|full name)$/i.test(name)) return
    const phone = cells[1] ? cells[1] : null
    const n = normaliseName(name)
    if (!n) return
    const p = normalisePhone(phone)
    const duplicate = names.has(n) || (p.length >= 7 && phones.has(p))
    names.add(n)
    if (p.length >= 7) phones.add(p)
    out.push({ name: name.slice(0, 100), phone, duplicate })
  })
  return out
}

/** People matching what the user typed, best first: prefix matches, then word-start, then substring. */
export function matchPeople<T extends PersonLike>(people: T[], query: string, limit = 6): T[] {
  const q = normaliseName(query)
  if (!q) return people.slice(0, limit)
  const rank = (p: T): number => {
    const n = normaliseName(p.name)
    return n.startsWith(q) ? 0 : n.split(' ').some((w) => w.startsWith(q)) ? 1 : n.includes(q) ? 2 : 3
  }
  return people.map((p) => [p, rank(p)] as const).filter(([, r]) => r < 3).sort((a, b) => a[1] - b[1] || a[0].name.localeCompare(b[0].name)).slice(0, limit).map(([p]) => p)
}
