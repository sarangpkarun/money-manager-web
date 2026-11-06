import { Component, type ReactNode } from 'react'

/** Catches a crash in the screen tree: logs it (scrubbed) and shows a way out instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode; onError?: (e: unknown) => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: unknown) { this.props.onError?.(error) }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className="flex h-full flex-col items-center justify-center gap-4 bg-bg p-8 text-center text-fg">
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="max-w-xs text-muted">Your data is safe. Reload to carry on; if it keeps happening, the error is in Settings, About.</p>
        <button onClick={() => window.location.reload()} className="min-h-12 rounded-full bg-accent px-6 font-semibold text-on-accent">Reload</button>
      </div>
    )
  }
}
