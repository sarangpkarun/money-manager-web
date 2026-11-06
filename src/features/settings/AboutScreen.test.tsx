import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ rows: [] as unknown[], error: null as string | null, del: vi.fn(async () => ({ error: null as { message: string } | null })) }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ order: () => ({ limit: async () => (m.error ? { data: null, error: { message: m.error } } : { data: m.rows, error: null }) }) }),
      delete: () => ({ gte: m.del }),
    }),
  },
}))

import AboutScreen from './AboutScreen'

vi.stubGlobal('__APP_VERSION__', '1.2.3')
vi.stubGlobal('__BUILD_TIME__', '2026-11-05T10:00:00.000Z')
beforeEach(() => { m.rows = []; m.error = null; m.del.mockClear() })

const ui = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><AboutScreen /></MemoryRouter></QueryClientProvider>,
)
const err = (n: number) => ({ id: `e${n}`, at: `2026-11-0${n}T10:00:00Z`, kind: 'error', message: `TypeError: x is undefined ${n}`, route: '/activity', app_version: '1.2.3' })

describe('About', () => {
  it('shows version, build date and where the data lives', async () => {
    ui()
    expect(screen.getByText('1.2.3')).toBeInTheDocument()
    expect(screen.getByText('2026-11-05')).toBeInTheDocument()
    expect(await screen.findByText(/^None\./)).toBeInTheDocument()
  })

  it('lists recent errors with kind, version and route, and Clear removes them', async () => {
    m.rows = [err(2), err(1)]
    const user = userEvent.setup()
    ui()
    expect(await screen.findAllByRole('listitem')).toHaveLength(2)
    const list = screen.getByRole('region', { name: 'Recent errors' })
    expect(list).toHaveTextContent('TypeError: x is undefined 2')
    expect(list).toHaveTextContent('error · 1.2.3')
    expect(list).toHaveTextContent('/activity')
    m.rows = []
    await user.click(within(list).getByRole('button', { name: 'Clear' }))
    await waitFor(() => expect(m.del).toHaveBeenCalledOnce())
    expect(await screen.findByText(/^None\./)).toBeInTheDocument()
  })

  it('a failing load says so without breaking the page', async () => {
    m.error = 'permission denied'
    ui()
    expect(await screen.findByText("Couldn't load the error log.")).toBeInTheDocument()
    expect(screen.getByText('Version')).toBeInTheDocument()
  })
})
