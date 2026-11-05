import { createECDH, webcrypto } from 'node:crypto'
// http_ece is the reference implementation that web-push itself uses: an independent check of our encryption
// @ts-expect-error no bundled types
import ece from 'http_ece'
import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'
import { b64uToBytes, bytesToB64u, encryptPayload, sendPush, vapidAuthorization, type VapidKeys } from '../../supabase/functions/_shared/webpush.ts'

const subtle = webcrypto.subtle as unknown as SubtleCrypto

/** A browser's side of a subscription. */
function browser() {
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  const auth = Buffer.from(webcrypto.getRandomValues(new Uint8Array(16)))
  return { ecdh, auth, sub: { p256dh: bytesToB64u(ecdh.getPublicKey()), auth: bytesToB64u(auth) } }
}

async function vapid(): Promise<{ keys: VapidKeys; publicKey: CryptoKey }> {
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const jwk = await subtle.exportKey('jwk', pair.privateKey)
  const raw = new Uint8Array(await subtle.exportKey('raw', pair.publicKey))
  return { keys: { publicKey: bytesToB64u(raw), privateKey: jwk.d as string, subject: 'mailto:admin@example.com' }, publicKey: pair.publicKey }
}

describe('base64url', () => {
  it('round-trips any bytes', () => {
    fc.assert(fc.property(fc.uint8Array({ maxLength: 200 }), (b) => {
      const s = bytesToB64u(b)
      expect(s).not.toMatch(/[+/=]/)
      expect([...b64uToBytes(s)]).toEqual([...b])
    }))
  })
})

describe('message encryption (RFC 8291, aes128gcm)', () => {
  it('a browser can decrypt it (reference implementation http_ece)', async () => {
    const b = browser()
    const text = 'Due tomorrow · Pay Ravi ₹5,000 — Loan A'
    const body = await encryptPayload(new TextEncoder().encode(text), b.sub)
    const plain = ece.decrypt(Buffer.from(body), { version: 'aes128gcm', privateKey: b.ecdh, authSecret: b.auth })
    expect(Buffer.from(plain).toString('utf8')).toBe(text)
  })

  it('produces byte-for-byte what the reference implementation produces for the same keys and salt', async () => {
    const b = browser()
    const sender = createECDH('prime256v1'); sender.generateKeys()
    const salt = Buffer.from(webcrypto.getRandomValues(new Uint8Array(16)))
    const payload = Buffer.from(JSON.stringify({ title: 'Due today', body: 'x'.repeat(300), url: '/money' }))
    const reference = ece.encrypt(payload, { version: 'aes128gcm', dh: b.ecdh.getPublicKey(), privateKey: sender, authSecret: b.auth, salt })

    const pub = sender.getPublicKey()
    const key: CryptoKeyPair = {
      privateKey: await subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', d: bytesToB64u(sender.getPrivateKey()), x: bytesToB64u(pub.subarray(1, 33)), y: bytesToB64u(pub.subarray(33, 65)), ext: true }, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']),
      publicKey: await subtle.importKey('raw', pub, { name: 'ECDH', namedCurve: 'P-256' }, true, []),
    }
    const ours = await encryptPayload(payload, b.sub, { salt: new Uint8Array(salt), senderKeyPair: key })
    expect(Buffer.from(ours).toString('hex')).toBe(Buffer.from(reference).toString('hex'))
  })

  it('every message uses a fresh salt and key, and the header is well formed', async () => {
    const b = browser()
    const a = await encryptPayload(new Uint8Array([1, 2, 3]), b.sub)
    const c = await encryptPayload(new Uint8Array([1, 2, 3]), b.sub)
    expect(Buffer.from(a).equals(Buffer.from(c))).toBe(false)
    expect(new DataView(a.buffer).getUint32(16)).toBe(4096) // record size
    expect(a[20]).toBe(65) // key id length
    expect(a[21]).toBe(4) // uncompressed point
    expect(a.length).toBe(21 + 65 + 3 + 1 + 16) // header + payload + padding delimiter + GCM tag
  })

  it('property: any payload up to the record limit decrypts', async () => {
    const b = browser()
    await fc.assert(fc.asyncProperty(fc.uint8Array({ maxLength: 600 }), async (bytes) => {
      const body = await encryptPayload(bytes, b.sub)
      expect([...ece.decrypt(Buffer.from(body), { version: 'aes128gcm', privateKey: b.ecdh, authSecret: b.auth })]).toEqual([...bytes])
    }), { numRuns: 25 })
  })

  it('refuses bad keys and oversized payloads', async () => {
    const b = browser()
    await expect(encryptPayload(new Uint8Array(1), { p256dh: 'AAAA', auth: b.sub.auth })).rejects.toThrow(/p256dh/)
    await expect(encryptPayload(new Uint8Array(1), { p256dh: b.sub.p256dh, auth: 'AAAA' })).rejects.toThrow(/auth/)
    await expect(encryptPayload(new Uint8Array(4079), b.sub)).rejects.toThrow(/too large/)
    await expect(encryptPayload(new Uint8Array(4078), b.sub)).resolves.toBeInstanceOf(Uint8Array)
  })
})

describe('VAPID', () => {
  it('signs a JWT the push service can verify, scoped to the endpoint origin', async () => {
    const { keys, publicKey } = await vapid()
    const header = await vapidAuthorization('https://web.push.apple.com/abc123/def', keys, Date.UTC(2026, 10, 15, 12, 0, 0))
    const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(header)
    expect(m).not.toBeNull()
    const [, h, c, s, k] = m!
    expect(k).toBe(keys.publicKey)
    expect(JSON.parse(Buffer.from(b64uToBytes(h!)).toString())).toEqual({ typ: 'JWT', alg: 'ES256' })
    const claims = JSON.parse(Buffer.from(b64uToBytes(c!)).toString())
    expect(claims).toEqual({ aud: 'https://web.push.apple.com', exp: Math.floor(Date.UTC(2026, 10, 15, 12, 0, 0) / 1000) + 12 * 3600, sub: 'mailto:admin@example.com' })
    const ok = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, new Uint8Array(b64uToBytes(s!)), new TextEncoder().encode(`${h}.${c}`))
    expect(ok).toBe(true)
    expect(b64uToBytes(s!)).toHaveLength(64) // r || s
  })

  it('rejects a malformed public key', async () => {
    const { keys } = await vapid()
    await expect(vapidAuthorization('https://x.example/p', { ...keys, publicKey: 'AAAA' })).rejects.toThrow(/uncompressed/)
  })
})

describe('sendPush', () => {
  it('posts an encrypted body with the push headers and reports the status', async () => {
    const b = browser()
    const { keys } = await vapid()
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }))
    const res = await sendPush({ endpoint: 'https://fcm.googleapis.com/wp/xyz', keys: b.sub }, { title: 'Hi', body: 'There', url: '/', tag: 'k' }, keys, { fetch: fetchMock as unknown as typeof fetch, ttl: 3600, urgency: 'high' })
    expect(res).toEqual({ status: 201 })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://fcm.googleapis.com/wp/xyz')
    const h = init.headers as Record<string, string>
    expect(h).toMatchObject({ 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '3600', Urgency: 'high' })
    expect(h.Authorization).toMatch(/^vapid t=.+, k=.+$/)
    const plain = ece.decrypt(Buffer.from(init.body as ArrayBuffer), { version: 'aes128gcm', privateKey: b.ecdh, authSecret: b.auth })
    expect(JSON.parse(Buffer.from(plain).toString())).toEqual({ title: 'Hi', body: 'There', url: '/', tag: 'k' })
  })

  it('passes other statuses through (the caller decides what 404/410/500 mean)', async () => {
    const b = browser()
    const { keys } = await vapid()
    for (const status of [404, 410, 429, 500]) {
      const f = vi.fn(async () => new Response(null, { status }))
      expect(await sendPush({ endpoint: 'https://push.example/x', keys: b.sub }, {}, keys, { fetch: f as unknown as typeof fetch })).toEqual({ status })
    }
  })
})
