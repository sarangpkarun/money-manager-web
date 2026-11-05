import { create } from 'zustand'

export type ThemePref = 'system' | 'light' | 'dark'
const KEY = 'theme'
const COLORS = { light: '#f2f3f7', dark: '#0b0f14' }

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function resolveTheme(pref: ThemePref, systemDark: boolean): 'light' | 'dark' {
  return pref === 'system' ? (systemDark ? 'dark' : 'light') : pref
}

export function applyTheme(pref: ThemePref) {
  const dark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
  const t = resolveTheme(pref, dark)
  document.documentElement.dataset.theme = t
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLORS[t])
}

interface ThemeState {
  pref: ThemePref
  setPref: (p: ThemePref) => void
}

export const useTheme = create<ThemeState>((set) => ({
  pref: read(),
  setPref: (pref) => {
    try {
      localStorage.setItem(KEY, pref)
    } catch {
      /* storage unavailable: still apply for this session */
    }
    applyTheme(pref)
    set({ pref })
  },
}))

export function initTheme() {
  applyTheme(useTheme.getState().pref)
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () =>
    applyTheme(useTheme.getState().pref),
  )
}
