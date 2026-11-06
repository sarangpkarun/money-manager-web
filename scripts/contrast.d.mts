export const hexToRgb: (hex: string) => number[]
export const luminance: (hex: string) => number
export const contrast: (a: string, b: string) => number
export const blend: (fg: string, bg: string, alpha: number) => string
export const readVars: (css: string, selector: string) => Record<string, string>
export const MIN_TEXT: number
export const pairs: (vars: Record<string, string>) => { name: string; ratio: number; min: number }[]
export const checkTheme: (css: string) => { theme: string; name: string; ratio: number; min: number }[]
