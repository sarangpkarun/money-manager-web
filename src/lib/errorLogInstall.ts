import { createReporter, type ErrorKind } from './errorLog'
import { supabase } from './supabase'

/** The app-wide reporter: signed-in and online only, stored in the user's own `client_errors` table. */
export const reporter = createReporter({
  context: () => ({ route: window.location.pathname, version: __APP_VERSION__, userAgent: navigator.userAgent }),
  canSend: async () => navigator.onLine && !!(await supabase.auth.getSession()).data.session,
  send: async (row) => { await supabase.from('client_errors').insert(row) },
})

/** Hooks uncaught errors and unhandled promise rejections. Call once at start-up. */
export function installErrorLog(target: Window = window): () => void {
  const onError = (e: ErrorEvent) => reporter.report('error', e.error ?? e.message)
  const onRejection = (e: PromiseRejectionEvent) => reporter.report('unhandledrejection', e.reason)
  target.addEventListener('error', onError)
  target.addEventListener('unhandledrejection', onRejection)
  return () => {
    target.removeEventListener('error', onError)
    target.removeEventListener('unhandledrejection', onRejection)
  }
}

export const reportBoundary = (e: unknown) => reporter.report('boundary' satisfies ErrorKind, e)
