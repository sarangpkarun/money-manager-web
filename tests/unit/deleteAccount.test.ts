import { describe, expect, it, vi } from 'vitest'
import { handleDelete, type DeleteDeps } from '../../supabase/functions/_shared/deleteAccount.ts'

const deps = (over: Partial<DeleteDeps> = {}) => {
  const d = { getUser: vi.fn<DeleteDeps['getUser']>(async () => ({ id: 'u1' })), deleteUser: vi.fn<DeleteDeps['deleteUser']>(async () => undefined), ...over }
  return d as typeof d & DeleteDeps
}

describe('handleDelete', () => {
  it('deletes the user the token belongs to', async () => {
    const d = deps()
    expect(await handleDelete('POST', 'Bearer abc', d)).toEqual({ status: 200, body: { deleted: true } })
    expect(d.getUser).toHaveBeenCalledWith('Bearer abc')
    expect(d.deleteUser).toHaveBeenCalledExactlyOnceWith('u1')
  })
  it('refuses other methods and a missing or malformed token without touching anything', async () => {
    for (const [m, a] of [['GET', 'Bearer abc'], ['POST', null], ['POST', ''], ['POST', 'abc'], ['POST', 'Bearer ']] as const) {
      const d = deps()
      expect((await handleDelete(m, a, d)).status).toBe(m === 'GET' ? 405 : 401)
      expect(d.getUser).not.toHaveBeenCalled()
      expect(d.deleteUser).not.toHaveBeenCalled()
    }
  })
  it('an invalid token (no user, or lookup throws) is 401 and deletes nothing', async () => {
    for (const getUser of [async () => null, async () => { throw new Error('bad jwt') }]) {
      const d = deps({ getUser })
      expect((await handleDelete('POST', 'Bearer x', d)).status).toBe(401)
      expect(d.deleteUser).not.toHaveBeenCalled()
    }
  })
  it('a failing delete is a 500 that says nothing about why', async () => {
    const r = await handleDelete('POST', 'Bearer x', deps({ deleteUser: async () => { throw new Error('db secret detail') } }))
    expect(r).toEqual({ status: 500, body: { error: 'could not delete the account' } })
  })
})
