// Web Push for Deno (Supabase Edge) and Node (tests) using only WebCrypto: VAPID (RFC 8292) and message encryption (RFC 8291, aes128gcm).
// No dependencies, so it behaves the same wherever it runs.

const enc = new TextEncoder()

export const b64uToBytes = (s: string): Uint8Array => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}
export const bytesToB64u = (b: Uint8Array): string => {
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}
// WebCrypto wants plain ArrayBuffers: copy into one so typed-array views never leak extra bytes
const ab = (b: Uint8Array): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer

export interface VapidKeys {
  /** URL-safe base64 of the 65-byte uncompressed public key (also the browser's applicationServerKey) */
  publicKey: string
  /** URL-safe base64 of the 32-byte private scalar */
  privateKey: string
  /** mailto: or https: contact for the push service */
  subject: string
}

async function importVapidPrivate(keys: VapidKeys): Promise<CryptoKey> {
  const pub = b64uToBytes(keys.publicKey)
  if (pub.length !== 65 || pub[0] !== 4) throw new RangeError('VAPID public key must be an uncompressed P-256 point')
  const jwk = { kty: 'EC', crv: 'P-256', d: keys.privateKey, x: bytesToB64u(pub.slice(1, 33)), y: bytesToB64u(pub.slice(33, 65)), ext: true }
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
}

/** The `Authorization` header value for a push service endpoint: `vapid t=<jwt>, k=<public key>`. */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, nowMs = Date.now(), ttlSec = 12 * 3600): Promise<string> {
  const aud = new URL(endpoint).origin
  const header = bytesToB64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = bytesToB64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(nowMs / 1000) + ttlSec, sub: keys.subject })))
  const unsigned = `${header}.${claims}`
  // WebCrypto returns r||s (64 bytes), which is exactly the JWS ES256 signature format
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await importVapidPrivate(keys), enc.encode(unsigned)))
  return `vapid t=${unsigned}.${bytesToB64u(sig)}, k=${keys.publicKey}`
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ab(ikm), 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: ab(salt), info: ab(info) }, key, bytes * 8))
}

export interface EncryptOptions {
  /** fixed values for tests; random otherwise */
  salt?: Uint8Array
  senderKeyPair?: CryptoKeyPair
  recordSize?: number
}

/**
 * Encrypts `payload` for a browser subscription (RFC 8291 + RFC 8188, one record). `p256dh` is the browser's public key and `auth`
 * its 16-byte secret, both URL-safe base64. Returns the request body.
 */
export async function encryptPayload(payload: Uint8Array, subscription: { p256dh: string; auth: string }, opts: EncryptOptions = {}): Promise<Uint8Array> {
  const uaPublic = b64uToBytes(subscription.p256dh)
  const authSecret = b64uToBytes(subscription.auth)
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new RangeError('invalid p256dh key')
  if (authSecret.length !== 16) throw new RangeError('invalid auth secret')
  const rs = opts.recordSize ?? 4096
  if (payload.length > rs - 17 - 1) throw new RangeError('payload too large for one record')

  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const sender = opts.senderKeyPair ?? (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']))
  const senderPublic = new Uint8Array(await crypto.subtle.exportKey('raw', sender.publicKey))
  const uaKey = await crypto.subtle.importKey('raw', ab(uaPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, sender.privateKey, 256))

  // RFC 8291 section 3.4
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, senderPublic)
  const ikm = await hkdf(authSecret, ecdh, keyInfo, 32)
  // RFC 8188 section 2.2 / 2.3
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)

  const record = concat(payload, new Uint8Array([2])) // 0x02 marks the last (only) record
  const key = await crypto.subtle.importKey('raw', ab(cek), 'AES-GCM', false, ['encrypt'])
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ab(nonce) }, key, ab(record)))

  const header = new Uint8Array(21 + senderPublic.length)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, rs)
  header[20] = senderPublic.length
  header.set(senderPublic, 21)
  return concat(header, cipher)
}

export interface PushSubscriptionLike { endpoint: string; keys: { p256dh: string; auth: string } }

export interface PushResult { status: number }

/** Sends one notification. `ttl` seconds the push service may hold it; `urgency` per RFC 8030. Resolves with the HTTP status (201 = accepted). */
export async function sendPush(sub: PushSubscriptionLike, payload: unknown, vapid: VapidKeys, opts: { ttl?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high'; fetch?: typeof fetch } = {}): Promise<PushResult> {
  const body = await encryptPayload(enc.encode(JSON.stringify(payload)), sub.keys)
  const res = await (opts.fetch ?? fetch)(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(sub.endpoint, vapid),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(opts.ttl ?? 6 * 3600),
      Urgency: opts.urgency ?? 'normal',
    },
    body: ab(body),
  })
  return { status: res.status }
}
