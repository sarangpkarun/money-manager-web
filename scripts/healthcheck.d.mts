export function runChecks(o: { appUrl: string; supabaseUrl: string; anonKey: string; fetchImpl?: typeof fetch; timeoutMs?: number }): Promise<{ name: string; ok: boolean; detail: string }[]>
