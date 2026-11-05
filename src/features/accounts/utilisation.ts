/** Credit-card utilisation in basis points (3200 = 32%); null without a limit. Not capped, so >100% is visible. */
export function utilisationBps(outstanding: number | null | undefined, limit: number | null | undefined): number | null {
  if (!limit || limit <= 0 || outstanding == null) return null
  return Math.round((outstanding * 10_000) / limit)
}

export type UtilTone = 'green' | 'amber' | 'red'
/** Under 30% is healthy, 30-50% watch, over 50% high (spec insight rule 4 starts at 50%). */
export const utilisationTone = (bps: number): UtilTone => (bps > 5000 ? 'red' : bps > 3000 ? 'amber' : 'green')
