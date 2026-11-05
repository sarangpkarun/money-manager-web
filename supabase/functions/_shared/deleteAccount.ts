/** Pure core of the delete-account function: who is asking, then delete that user and nobody else. Dependencies are injected. */
export interface DeleteDeps {
  /** The user the caller's token belongs to, or null if the token is missing or invalid. */
  getUser: (authorization: string) => Promise<{ id: string } | null>
  /** Removes the auth user; every table row cascades from it. Throws on failure. */
  deleteUser: (id: string) => Promise<void>
}

export interface DeleteResult { status: number; body: Record<string, unknown> }

export async function handleDelete(method: string, authorization: string | null, deps: DeleteDeps): Promise<DeleteResult> {
  if (method !== 'POST') return { status: 405, body: { error: 'method not allowed' } }
  if (!authorization || !/^Bearer\s+\S+/i.test(authorization)) return { status: 401, body: { error: 'unauthorized' } }
  let user: { id: string } | null
  try { user = await deps.getUser(authorization) } catch { return { status: 401, body: { error: 'unauthorized' } } }
  if (!user?.id) return { status: 401, body: { error: 'unauthorized' } }
  try {
    await deps.deleteUser(user.id)
  } catch {
    return { status: 500, body: { error: 'could not delete the account' } }
  }
  return { status: 200, body: { deleted: true } }
}
