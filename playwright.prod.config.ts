import { defineConfig } from '@playwright/test'

/**
 * Runs against the PRODUCTION build (`vite build` + `vite preview`), which sends the same security headers as Vercel
 * (vercel.json). Needs the local Supabase stack. Usage: pnpm e2e:prod
 */
export default defineConfig({
  testDir: 'e2e-prod',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm build && pnpm exec vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
