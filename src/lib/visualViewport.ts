/**
 * Keyboard-aware layout for iPhone. On iOS the on-screen keyboard does not shrink the layout viewport (what `fixed bottom-0` is
 * measured against); only the visual viewport shrinks. These helpers publish the keyboard height and the visible height as CSS
 * variables so bottom sheets can sit on top of the keyboard instead of hiding behind it.
 */

export interface ViewportLike { height: number; offsetTop: number }

/** Below this many pixels of "keyboard" we treat the inset as browser chrome (URL bar changes), not a keyboard. */
export const KEYBOARD_MIN = 80

/** How much of the bottom of the layout viewport the keyboard covers. Also right when iOS scrolls the layout up to reveal a field. */
export function keyboardInset(innerHeight: number, vv: ViewportLike | null | undefined): number {
  if (!vv) return 0
  return Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop))
}

export interface ViewportEnv {
  window: Pick<Window, 'innerHeight' | 'requestAnimationFrame' | 'cancelAnimationFrame'> & { visualViewport?: (ViewportLike & EventTarget) | null }
  root: { style: { setProperty: (k: string, v: string) => void; removeProperty: (k: string) => void }; dataset: DOMStringMap }
}

/** Writes `--kb`, `--vv-h` and `data-keyboard` on the root element now and whenever the visual viewport changes. Returns an uninstaller. */
export function installViewportVars(env: ViewportEnv = { window, root: document.documentElement }): () => void {
  const { window: w, root } = env
  const vv = w.visualViewport
  if (!vv) return () => undefined
  let frame = 0
  const apply = () => {
    frame = 0
    const inset = keyboardInset(w.innerHeight, vv)
    const open = inset >= KEYBOARD_MIN
    root.style.setProperty('--kb', `${open ? inset : 0}px`)
    root.style.setProperty('--vv-h', `${Math.round(vv.height)}px`)
    if (open) root.dataset.keyboard = 'open'
    else delete root.dataset.keyboard
  }
  const schedule = () => { if (!frame) frame = w.requestAnimationFrame(apply) }
  apply()
  vv.addEventListener('resize', schedule)
  vv.addEventListener('scroll', schedule)
  return () => {
    vv.removeEventListener('resize', schedule)
    vv.removeEventListener('scroll', schedule)
    if (frame) w.cancelAnimationFrame(frame)
    root.style.removeProperty('--kb')
    root.style.removeProperty('--vv-h')
    delete root.dataset.keyboard
  }
}
