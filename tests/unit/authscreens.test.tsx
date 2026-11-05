import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const { signIn, signUp } = vi.hoisted(() => ({
  signIn: vi.fn().mockResolvedValue({ error: { message: 'Invalid login credentials' } }),
  signUp: vi.fn().mockResolvedValue({ error: null }),
}))
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signInWithPassword: signIn, signUp, resetPasswordForEmail: vi.fn(), resend: vi.fn(), updateUser: vi.fn() } },
}))
vi.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ session: null, signOut: vi.fn(), finishRecovery: vi.fn() }) }))

import { AuthRoutes } from '@/features/auth/AuthScreens'

const at = (path: string) => render(<MemoryRouter initialEntries={[path]}><AuthRoutes /></MemoryRouter>)

describe('auth screens', () => {
  it('login: shows validation errors, then calls Supabase and shows server error', async () => {
    const user = userEvent.setup()
    at('/login')
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Email'), 'a@b.com')
    await user.type(screen.getByLabelText('Password'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    await waitFor(() => expect(signIn).toHaveBeenCalledWith({ email: 'a@b.com', password: 'secret123' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid login credentials')
  })

  it('signup: submits and shows the check-your-email page', async () => {
    const user = userEvent.setup()
    at('/signup')
    await user.type(screen.getByLabelText('Email'), 'new@b.com')
    await user.type(screen.getByLabelText('Password'), 'longenough')
    await user.type(screen.getByLabelText('Confirm password'), 'longenough')
    await user.click(screen.getByRole('button', { name: 'Sign up' }))
    expect(await screen.findByText('Check your email')).toBeInTheDocument()
    expect(signUp).toHaveBeenCalled()
  })

  it('unknown routes redirect to login; links navigate', async () => {
    const user = userEvent.setup()
    at('/whatever')
    expect(screen.getByText('Welcome back')).toBeInTheDocument()
    await user.click(screen.getByText('Create account'))
    expect(screen.getByText('Create account', { selector: 'h1' })).toBeInTheDocument()
  })
})
