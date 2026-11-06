import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

const Boom = ({ fail }: { fail: boolean }) => { if (fail) throw new Error('render exploded'); return <p>fine</p> }
afterEach(() => vi.restoreAllMocks())

describe('ErrorBoundary', () => {
  it('shows children normally', () => {
    render(<ErrorBoundary><Boom fail={false} /></ErrorBoundary>)
    expect(screen.getByText('fine')).toBeInTheDocument()
  })
  it('catches a crash, reports it, and offers a reload instead of a blank page', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const onError = vi.fn()
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    render(<ErrorBoundary onError={onError}><Boom fail /></ErrorBoundary>)
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
    expect(screen.getByRole('alert')).toHaveTextContent('Your data is safe')
    expect(onError).toHaveBeenCalledOnce()
    expect((onError.mock.calls[0] as unknown as [Error])[0].message).toBe('render exploded')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
  })
  it('works without an onError handler', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(<ErrorBoundary><Boom fail /></ErrorBoundary>)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
