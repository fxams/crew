/**
 * Signed KOL desk session after X OAuth.
 * Lets a registered KOL add a payout wallet without already having one.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

export const KOL_SESSION_COOKIE = 'crew_kol'
export const KOL_SESSION_TTL_SEC = 30 * 24 * 60 * 60

export type KolSessionClaims = {
  v: 1
  u: string
  h: string
  exp: number
}

export function kolSessionSecret(): string {
  const raw =
    process.env.KOL_SESSION_SECRET?.trim() ||
    process.env.KOL_OAUTH_STATE_SECRET?.trim() ||
    process.env.X_CLIENT_SECRET?.trim() ||
    process.env.CREW_API_KEY?.trim() ||
    ''
  if (!raw) {
    throw new Error('Cannot sign KOL session. Set X_CLIENT_SECRET or KOL_SESSION_SECRET.')
  }
  return raw
}

function b64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad
  return Buffer.from(b64, 'base64')
}

function hmac(secret: string, body: string): Buffer {
  return createHmac('sha256', secret).update(body).digest()
}

function macEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function signKolSession(claims: KolSessionClaims, secret: string): string {
  const body = b64url(Buffer.from(JSON.stringify(claims), 'utf8'))
  const mac = b64url(hmac(secret, `ks1.${body}`))
  return `ks1.${body}.${mac}`
}

export function verifyKolSession(
  token: string,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
): { ok: true; claims: KolSessionClaims } | { ok: false } {
  const raw = (token || '').trim()
  const parts = raw.split('.')
  if (parts.length !== 3 || parts[0] !== 'ks1' || !parts[1] || !parts[2]) {
    return { ok: false }
  }
  const got = fromB64url(parts[2])
  const want = hmac(secret, `ks1.${parts[1]}`)
  if (!macEqual(got, want)) return { ok: false }
  let parsed: unknown
  try {
    parsed = JSON.parse(fromB64url(parts[1]).toString('utf8'))
  } catch {
    return { ok: false }
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false }
  const c = parsed as Partial<KolSessionClaims>
  if (
    c.v !== 1 ||
    typeof c.u !== 'string' ||
    !c.u.trim() ||
    typeof c.h !== 'string' ||
    !c.h.trim() ||
    typeof c.exp !== 'number' ||
    !Number.isFinite(c.exp)
  ) {
    return { ok: false }
  }
  if (nowSec >= c.exp) return { ok: false }
  return {
    ok: true,
    claims: { v: 1, u: c.u.trim(), h: c.h.trim(), exp: c.exp },
  }
}

export function issueKolSessionToken(opts: { xUserId: string; username: string }): string {
  const exp = Math.floor(Date.now() / 1000) + KOL_SESSION_TTL_SEC
  return signKolSession(
    { v: 1, u: opts.xUserId.trim(), h: opts.username.replace(/^@+/, ''), exp },
    kolSessionSecret(),
  )
}

export function kolSessionCookieHeader(token: string): string {
  return `${KOL_SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${KOL_SESSION_TTL_SEC}`
}

export function readKolSessionCookie(
  cookieHeader: string | undefined,
  secret = kolSessionSecret(),
): KolSessionClaims | null {
  const match = String(cookieHeader || '').match(/(?:^|;)\s*crew_kol=([^;]+)/)
  if (!match?.[1]) return null
  let token = match[1]
  try {
    token = decodeURIComponent(token)
  } catch {
    /* already decoded */
  }
  const verified = verifyKolSession(token, secret)
  return verified.ok ? verified.claims : null
}

export function phantomAppIdFromEnv(): string {
  return (process.env.PHANTOM_APP_ID || process.env.VITE_PHANTOM_APP_ID || '').trim()
}
