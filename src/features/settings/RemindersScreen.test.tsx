import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useToasts } from '@/ui/toastStore'

const m = vi.hoisted(() => ({
  status: { support: 'ok', permission: 'default', subscribed: false, endpoint: null } as unknown,
  enable: vi.fn(), disable: vi.fn(), rpc: vi.fn(), invoke: vi.fn(), del: vi.fn(), save: vi.fn(),
  profile: { alarm_time: '09:00:00', quiet_from: null, quiet_until: null, summary_mode: 'off', summary_time: '08:00:00', summary_weekday: null } as unknown,
  key: 'KEY',
}))

vi.mock('@/lib/push', () => ({
  deviceStatus: async () => m.status, enablePush: (...a: unknown[]) => m.enable(...a), disablePush: (...a: unknown[]) => m.disable(...a), vapidPublicKey: () => m.key,
}))
vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...a: unknown[]) => m.rpc(...a), functions: { invoke: (...a: unknown[]) => m.invoke(...a) }, from: () => ({ delete: () => ({ eq: (...a: unknown[]) => m.del(...a) }) }) },
}))
vi.mock('@/features/profile/useProfile', () => ({
  useProfile: () => ({ data: m.profile }),
  useUpdateProfile: () => ({ mutateAsync: m.save, isPending: false }),
}))

import RemindersScreen from './RemindersScreen'

const ui = () => render(<MemoryRouter><RemindersScreen /></MemoryRouter>)
const status = (o: Record<string, unknown>) => { m.status = { support: 'ok', permission: 'default', subscribed: false, endpoint: null, ...o } }

beforeEach(() => {
  vi.clearAllMocks()
  status({})
  m.key = 'KEY'
  m.profile = { alarm_time: '09:00:00', quiet_from: null, quiet_until: null, summary_mode: 'off', summary_time: '08:00:00', summary_weekday: null }
  m.save.mockResolvedValue({})
  m.disable.mockResolvedValue(undefined)
  useToasts.setState({ toasts: [] })
})

describe('This device', () => {
  it('iPhone in Safari: explains how to install first, no button', async () => {
    status({ support: 'needs-install', permission: 'unavailable' })
    ui()
    expect(await screen.findByText(/Add to Home Screen/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Turn on notifications' })).toBeNull()
  })
  it('unsupported browsers and blocked permission each say why', async () => {
    status({ support: 'unsupported', permission: 'unavailable' })
    const v = ui()
    expect(await screen.findByText("This browser can't receive push notifications.")).toBeInTheDocument()
    v.unmount()
    status({ permission: 'denied' })
    ui()
    expect(await screen.findByText(/Notifications are blocked/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Turn on notifications' })).toBeNull()
  })
  it('a build without the public key says so', async () => {
    m.key = ''
    ui()
    expect(await screen.findByText(/missing public key/)).toBeInTheDocument()
  })

  it('Turn on: asks, stores the subscription through the server, then shows it as on', async () => {
    const user = userEvent.setup()
    m.enable.mockImplementation(async (save: (s: unknown) => Promise<void>) => {
      await save({ endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' }, userAgent: 'iPhone' })
      status({ permission: 'granted', subscribed: true, endpoint: 'https://push.example/abc' })
      return { ok: true, endpoint: 'https://push.example/abc' }
    })
    m.rpc.mockResolvedValue({ error: null })
    ui()
    await user.click(await screen.findByRole('button', { name: 'Turn on notifications' }))
    expect(m.rpc).toHaveBeenCalledWith('claim_push_subscription', { p_endpoint: 'https://push.example/abc', p_keys: { p256dh: 'p', auth: 'a' }, p_user_agent: 'iPhone' })
    expect(await screen.findByText('Notifications are on.')).toBeInTheDocument()
    expect(useToasts.getState().toasts[0]?.message).toBe('Notifications are on for this device')
  })

  it('Turn on: a refused permission is explained', async () => {
    const user = userEvent.setup()
    m.enable.mockResolvedValue({ ok: false, reason: 'denied' })
    ui()
    await user.click(await screen.findByRole('button', { name: 'Turn on notifications' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Notifications are blocked')
  })

  it('Turn on: a server problem shows its message', async () => {
    const user = userEvent.setup()
    m.enable.mockResolvedValue({ ok: false, reason: 'failed', message: 'not signed in' })
    ui()
    await user.click(await screen.findByRole('button', { name: 'Turn on notifications' }))
    expect(await screen.findByRole('status')).toHaveTextContent('not signed in')
  })

  describe('when on', () => {
    beforeEach(() => status({ permission: 'granted', subscribed: true, endpoint: 'https://push.example/abc' }))

    it('Send a test reports how many devices got it', async () => {
      const user = userEvent.setup()
      m.invoke.mockResolvedValue({ data: { devices: 2, sent: 2, failed: 0 }, error: null })
      ui()
      await user.click(await screen.findByRole('button', { name: 'Send a test' }))
      expect(m.invoke).toHaveBeenCalledWith('send-test')
      expect(await screen.findByText('Sent to 2 devices. It should arrive in a few seconds.')).toBeInTheDocument()
    })
    it('Send a test: nothing accepted, no device, or an error', async () => {
      const user = userEvent.setup()
      ui()
      m.invoke.mockResolvedValueOnce({ data: { devices: 1, sent: 0, failed: 1 }, error: null })
      await user.click(await screen.findByRole('button', { name: 'Send a test' }))
      expect(await screen.findByText(/didn't accept it/)).toBeInTheDocument()
      m.invoke.mockResolvedValueOnce({ data: { devices: 0, sent: 0, failed: 0 }, error: null })
      await user.click(screen.getByRole('button', { name: 'Send a test' }))
      expect(await screen.findByText('No device is registered yet.')).toBeInTheDocument()
      m.invoke.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
      await user.click(screen.getByRole('button', { name: 'Send a test' }))
      expect(await screen.findByText("Couldn't send the test: boom")).toBeInTheDocument()
    })
    it('Turn off removes this device', async () => {
      const user = userEvent.setup()
      ui()
      await user.click(await screen.findByRole('button', { name: 'Turn off' }))
      expect(m.disable).toHaveBeenCalledOnce()
      const remove = m.disable.mock.calls[0]![0] as (e: string) => Promise<void>
      await remove('https://push.example/abc')
      expect(m.del).toHaveBeenCalledWith('endpoint', 'https://push.example/abc')
    })
  })
})

describe('Settings form', () => {
  const save = () => screen.getByRole('button', { name: 'Save' })

  it('loads the profile and saves changes', async () => {
    const user = userEvent.setup()
    ui()
    const alarm = await screen.findByLabelText('Reminder time')
    expect(alarm).toHaveValue('09:00')
    fireEvent.change(alarm, { target: { value: '07:30' } })
    await user.click(save())
    expect(m.save).toHaveBeenCalledWith({ alarm_time: '07:30', quiet_from: null, quiet_until: null, summary_mode: 'off', summary_time: '08:00', summary_weekday: null })
    expect(useToasts.getState().toasts[0]?.message).toBe('Reminder settings saved')
  })

  it('quiet hours: switch on, set times, saved; an alarm inside them is explained', async () => {
    const user = userEvent.setup()
    ui()
    await user.click(await screen.findByRole('switch', { name: 'Quiet hours' }))
    fireEvent.change(screen.getByLabelText('Reminder time'), { target: { value: '06:00' } })
    expect(screen.getByRole('note')).toHaveTextContent('06:00 is inside quiet hours, so reminders will arrive at 07:00 instead.')
    fireEvent.change(screen.getByLabelText('Reminder time'), { target: { value: '23:00' } })
    expect(screen.getByRole('note')).toHaveTextContent(/skipped/)
    fireEvent.change(screen.getByLabelText('Reminder time'), { target: { value: '09:00' } })
    expect(screen.queryByRole('note')).toBeNull()
    await user.click(save())
    expect(m.save.mock.calls[0]![0]).toMatchObject({ quiet_from: '22:00', quiet_until: '07:00' })
  })

  it('refuses quiet hours that start and end together, and saves nothing', async () => {
    const user = userEvent.setup()
    ui()
    await user.click(await screen.findByRole('switch', { name: 'Quiet hours' }))
    fireEvent.change(screen.getByLabelText('Until'), { target: { value: '22:00' } })
    await user.click(save())
    expect(await screen.findByText('Quiet hours need a start and an end that differ')).toBeInTheDocument()
    expect(m.save).not.toHaveBeenCalled()
  })

  it('an empty reminder time is refused', async () => {
    const user = userEvent.setup()
    ui()
    fireEvent.change(await screen.findByLabelText('Reminder time'), { target: { value: '' } })
    await user.click(save())
    expect(await screen.findByText('Choose a time')).toBeInTheDocument()
    expect(m.save).not.toHaveBeenCalled()
  })

  it('summary: off by default; daily shows a time; weekly adds the day; both save', async () => {
    const user = userEvent.setup()
    ui()
    const group = within(await screen.findByRole('group', { name: 'Summary frequency' }))
    expect(group.getByRole('button', { name: 'Off' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByLabelText('Day')).toBeNull()
    await user.click(group.getByRole('button', { name: 'Weekly' }))
    await user.selectOptions(screen.getByLabelText('Day'), '5')
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '18:00' } })
    await user.click(save())
    expect(m.save).toHaveBeenCalledWith(expect.objectContaining({ summary_mode: 'weekly', summary_time: '18:00', summary_weekday: 5 }))
    await user.click(group.getByRole('button', { name: 'Daily' }))
    expect(screen.queryByLabelText('Day')).toBeNull()
    await user.click(save())
    expect(m.save.mock.calls[1]![0]).toMatchObject({ summary_mode: 'daily', summary_weekday: null })
  })

  it('shows a save error from the server', async () => {
    const user = userEvent.setup()
    m.save.mockRejectedValueOnce(new Error('permission denied'))
    ui()
    await user.click(await screen.findByRole('button', { name: 'Save' }))
    expect(await screen.findByText('permission denied')).toBeInTheDocument()
  })

  it('reads existing settings (quiet hours, weekly summary) from the profile', async () => {
    m.profile = { alarm_time: '07:15:00', quiet_from: '23:00:00', quiet_until: '06:30:00', summary_mode: 'weekly', summary_time: '19:00:00', summary_weekday: 0 }
    ui()
    expect(await screen.findByLabelText('Reminder time')).toHaveValue('07:15')
    expect(screen.getByRole('switch', { name: 'Quiet hours' })).toBeChecked()
    expect(screen.getByLabelText('From')).toHaveValue('23:00')
    expect(screen.getByLabelText('Until')).toHaveValue('06:30')
    expect(screen.getByLabelText('Day')).toHaveValue('0')
    await waitFor(() => expect(screen.getByLabelText('Time')).toHaveValue('19:00'))
  })
})

describe('a stale cached profile', () => {
  it('is replaced by the fresh one while the form is untouched, but never over the user\'s edits', async () => {
    const user = userEvent.setup()
    const view = ui()
    expect(await screen.findByLabelText('Reminder time')).toHaveValue('09:00')
    m.profile = { ...(m.profile as object), alarm_time: '07:30:00' }
    view.rerender(<MemoryRouter><RemindersScreen /></MemoryRouter>)
    await waitFor(() => expect(screen.getByLabelText('Reminder time')).toHaveValue('07:30'))
    fireEvent.change(screen.getByLabelText('Reminder time'), { target: { value: '12:00' } })
    m.profile = { ...(m.profile as object), alarm_time: '05:00:00' }
    view.rerender(<MemoryRouter><RemindersScreen /></MemoryRouter>)
    expect(screen.getByLabelText('Reminder time')).toHaveValue('12:00') // the edit wins
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(m.save.mock.calls[0]![0]).toMatchObject({ alarm_time: '12:00' })
  })
})

