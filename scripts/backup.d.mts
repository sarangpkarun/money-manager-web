export const stamp: (d?: Date) => string
export const sumsLine: (hex: string, file: string) => string
export function backup(o?: { local?: boolean; root?: string; now?: Date; run?: (args: string[]) => void }): string
