export function fingerprint(db: { query: (q: string) => Promise<{ rows: Record<string, unknown>[] }> }): Promise<Record<string, unknown>>
export const same: (a: unknown, b: unknown) => boolean
