import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDisplay } from '@/lib/display'
import { useToasts } from '@/ui/toastStore'

const m = vi.hoisted(() => ({
  profile: undefined as unknown, save: vi.fn(), device: 'America/New_York' as string | null,
}))

vi.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ session: { user: { email: 'sarang@example.com' } }, signOut: vi.fn() }) }))
vi.mock('@/features/profile/useProfile', () => ({ useProfile: () => ({ data: m.profile }), useUpdateProfile: () => ({ mutateAsync: m.save, isPending: false }) }))
vi.mock('@/lib/timezones', async () => {
  const real = await vi.importActual<typeof import('@/lib/timezones')>('@/lib/timezones')
  return { ...real, listTimeZones: () => ['America/New_York', 'Asia/Kolkata', 'Asia/Kathmandu', 'Europe/London', 'UTC'], deviceTimeZone: () => m.device }
})

import DisplayScreen from './DisplayScreen'
import ProfileScreen from './ProfileScreen'

const base = { name: 'Sarang', timezone: 'Asia/Kolkata', week_starts_on: 1, number_format: 'indian', date_format: 'dd MMM yyyy', dashboard_layout: null }
beforeEach(() => {
  vi.clearAllMocks()
  m.profile = { ...base }; m.device = 'America/New_York'
  m.save.mockResolvedValue({})
  useToasts.setState({ toasts: [] })
  localStorage.clear()
})

const ui = (el: React.ReactElement) => render(<MemoryRouter>{el}</MemoryRouter>)

describe('Profile', () => {
  it('shows email and currency read-only, and the current name and time zone', () => {
    ui(<ProfileScreen />)
    expect(screen.getByLabelText('Name')).toHaveValue('Sarang')
    expect(screen.getByLabelText('Email')).toHaveTextContent('sarang@example.com')
    expect(screen.getByText('INR (₹)')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Asia\/Kolkata/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled() // nothing changed yet
  })

  it('validates the name and saves name and time zone together', async () => {
    const user = userEvent.setup()
    ui(<ProfileScreen />)
    const name = screen.getByLabelText('Name')
    await user.clear(name)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Enter your name')).toBeInTheDocument()
    expect(m.save).not.toHaveBeenCalled()
    await user.type(name, '  Sarang P  ')
    await user.type(screen.getByLabelText('Search time zones'), 'london')
    await user.click(screen.getByRole('option', { name: /Europe\/London/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(m.save).toHaveBeenCalledWith({ name: 'Sarang P', timezone: 'Europe/London' })
    expect(useToasts.getState().toasts[0]?.message).toBe('Profile saved')
  })

  it('refuses a name over 60 characters', async () => {
    const user = userEvent.setup()
    ui(<ProfileScreen />)
    const name = screen.getByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'x'.repeat(61))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Keep it under 60 characters')).toBeInTheDocument()
  })

  it('"Use this device" picks the device time zone; hidden when it is already the one', async () => {
    const user = userEvent.setup()
    const v = ui(<ProfileScreen />)
    await user.click(screen.getByRole('button', { name: /Use this device: America\/New_York/ }))
    expect(screen.getByRole('option', { name: /America\/New_York/ })).toHaveAttribute('aria-selected', 'true')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(m.save).toHaveBeenCalledWith({ name: 'Sarang', timezone: 'America/New_York' })
    v.unmount()
    m.device = 'Asia/Kolkata'
    ui(<ProfileScreen />)
    expect(screen.queryByRole('button', { name: /Use this device/ })).toBeNull()
  })

  it('search narrows the list; no match says so; a server error is shown', async () => {
    const user = userEvent.setup()
    m.save.mockRejectedValueOnce(new Error('invalid time zone'))
    ui(<ProfileScreen />)
    await user.type(screen.getByLabelText('Search time zones'), 'zzz')
    expect(screen.getByText('No match')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Search time zones'))
    await user.type(screen.getByLabelText('Search time zones'), 'asia')
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(2)
    await user.click(screen.getByRole('option', { name: /Asia\/Kathmandu/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid time zone')
  })
})

describe('Display', () => {
  it('number format: applies at once everywhere, shows an example, and saves', async () => {
    const user = userEvent.setup()
    ui(<DisplayScreen />)
    expect(screen.getByText('₹12,34,567.89')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Western' }))
    expect(getDisplay().number).toBe('western')
    expect(screen.getByText('₹1,234,567.89')).toBeInTheDocument()
    expect(m.save).toHaveBeenCalledWith({ number_format: 'western' })
  })

  it('date format: example follows the choice and it is saved', async () => {
    const user = userEvent.setup()
    ui(<DisplayScreen />)
    expect(screen.getByText('Thu, 5 Nov 2026')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '05/11/2026' }))
    expect(screen.getByText('Thu, 05/11/2026')).toBeInTheDocument()
    expect(getDisplay().date).toBe('dd/MM/yyyy')
    expect(m.save).toHaveBeenCalledWith({ date_format: 'dd/MM/yyyy' })
  })

  it('a failed save puts the screen and the app back as they were', async () => {
    const user = userEvent.setup()
    m.save.mockRejectedValueOnce(new Error('offline'))
    ui(<DisplayScreen />)
    await user.click(screen.getByRole('button', { name: 'Western' }))
    await waitFor(() => expect(getDisplay().number).toBe('indian'))
    expect(screen.getByRole('button', { name: 'Indian' })).toHaveAttribute('aria-pressed', 'true')
    expect(useToasts.getState().toasts[0]?.message).toBe("Couldn't save: offline")
  })

  it('week start and theme', async () => {
    const user = userEvent.setup()
    ui(<DisplayScreen />)
    expect(screen.getByRole('button', { name: 'Monday' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Sunday' }))
    expect(m.save).toHaveBeenCalledWith({ week_starts_on: 0 })
    await user.click(screen.getByRole('button', { name: 'Dark' }))
    expect(localStorage.getItem('theme')).toBe('dark')
  })
})

describe('Home cards editor', () => {
  const cards = () => screen.getByRole('region', { name: 'Home cards' })

  it('lists every card in the default order, all shown', () => {
    ui(<DisplayScreen />)
    const switches = within(cards()).getAllByRole('switch')
    expect(switches.map((s) => s.getAttribute('aria-label'))).toEqual([
      'Show This month', 'Show Where it went', 'Show Net position', 'Show Due soon', 'Show Money with people', 'Show EMI & loan load', 'Show Credit cards', 'Show Recent activity',
    ])
    expect(switches.every((s) => (s as HTMLInputElement).checked)).toBe(true)
    expect(within(cards()).getByRole('button', { name: 'Move This month up' })).toBeDisabled()
    expect(within(cards()).getByRole('button', { name: 'Move Recent activity down' })).toBeDisabled()
    expect(within(cards()).getByRole('button', { name: 'Save layout' })).toBeDisabled()
  })

  it('reorder and hide, then save the layout', async () => {
    const user = userEvent.setup()
    ui(<DisplayScreen />)
    await user.click(within(cards()).getByRole('button', { name: 'Move Recent activity up' }))
    await user.click(within(cards()).getByRole('button', { name: 'Move Recent activity up' }))
    await user.click(within(cards()).getByRole('switch', { name: 'Show Credit cards' }))
    await user.click(within(cards()).getByRole('button', { name: 'Save layout' }))
    expect(m.save).toHaveBeenCalledWith({
      dashboard_layout: { order: ['this_month', 'where_it_went', 'net_position', 'due_soon', 'people', 'recent', 'emi_load', 'cards'], hidden: ['cards'] },
    })
    expect(useToasts.getState().toasts[0]?.message).toBe('Home layout saved')
  })

  it('starts from the saved layout; Reset stores the default (null)', async () => {
    const user = userEvent.setup()
    m.profile = { ...base, dashboard_layout: { order: ['recent', 'this_month'], hidden: ['people'] } }
    ui(<DisplayScreen />)
    const labels = within(cards()).getAllByRole('switch').map((s) => s.getAttribute('aria-label'))
    expect(labels.slice(0, 2)).toEqual(['Show Recent activity', 'Show This month'])
    expect(within(cards()).getByRole('switch', { name: 'Show Money with people' })).not.toBeChecked()
    await user.click(within(cards()).getByRole('button', { name: 'Reset' }))
    expect(m.save).toHaveBeenCalledWith({ dashboard_layout: null })
    expect(within(cards()).getAllByRole('switch').every((s) => (s as HTMLInputElement).checked)).toBe(true)
  })

  it('a failed save says so', async () => {
    const user = userEvent.setup()
    m.save.mockRejectedValueOnce(new Error('denied'))
    ui(<DisplayScreen />)
    await user.click(within(cards()).getByRole('switch', { name: 'Show Due soon' }))
    await user.click(within(cards()).getByRole('button', { name: 'Save layout' }))
    await waitFor(() => expect(useToasts.getState().toasts[0]?.message).toBe("Couldn't save: denied"))
  })
})
