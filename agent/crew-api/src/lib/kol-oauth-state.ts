/**
 * Signed, short-lived KOL registration OAuth state.
 *
 * Registration used to require a `crew_reg` cookie across the X redirect. That
 * cookie is lost in wallet in-app browsers (Phantom iOS): the start request is
 * cross-origin (crewpay.dev → api.crewpay.dev) without credentialed cookies,
 * Safari ITP partitions it, and X often opens in Safari / the X app so the
 * callback runs in a different cookie jar.
 *
 * The OAuth `state` query param is the source of truth: an HMAC-signed payload
 * bound to the wallet signature, plus a one-time server row keyed by `sid`.
 * The cookie is only a fallback when the signed token cannot be read.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export const REGISTRATION_OAUTH_TTL_MS = 10 * 60_000
export const REGISTRATION_OAUTH_TTL_SEC = REGISTRATION_OAUTH_TTL_MS / 1000

export const CROSS_CONTEXT_HINT =
  'If you started in a wallet browser (Phantom), return there and tap Check.'

export const SESSION_MISSING_ERROR = `Sign-in session expired or this browser did not start registration. ${CROSS_CONTEXT_HINT} Otherwise tap Register with X again.`

export const SESSION_USED_ERROR = `This sign-in was already used. ${CROSS_CONTEXT_HINT} Registration may have finished in another browser.`

export const SESSION_EXPIRED_ERROR =
  'Sign-in expired. Tap Register with X again.'

export type RegistrationClaims = {
  v: 1
  /** One-time server row id (also stored as kol_oauth_states.state). */
  sid: string
  /** Solana wallet that signed the registration message. Empty when X-only signup. */
  w: string
  /** SHA-256 hex of the wallet signature (or of `x-only:{sid}` when no wallet). */
  sh: string
  /** Optional referral code. */
  r?: string
  /** Optional EVM / Base payout address. */
  e?: string
  /** Unix seconds expiry. */
  exp: number
}

export type StoredOAuthState = {
  sid: string
  codeVerifier: string
  wallet: string
  sigSha256: string | null
  referralCode: string | null
  evmWallet: string | null
  cookieSha256: string | null
  ip: string | null
  createdAtMs: number
  consumedAtMs: number | null
}

export type ResolveOk = {
  ok: true
  row: StoredOAuthState
  source: 'signed' | 'legacy' | 'cookie'
}

export type ResolveErr = {
  ok: false
  error: string
  code: 'invalid' | 'expired' | 'used' | 'missing' | 'mismatch'
}

const LEGACY_SID = /^[a-f0-9]{32}$/i

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

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function cookieSha256(cookie: string): string {
  return sha256Hex(cookie)
}

/** HMAC key: dedicated secret, else X client secret, else API key. */
export function registrationStateSecret(): string {
  const raw =
    process.env.KOL_OAUTH_STATE_SECRET?.trim() ||
    process.env.X_CLIENT_SECRET?.trim() ||
    process.env.CREW_API_KEY?.trim() ||
    ''
  if (!raw) {
    throw new Error('Cannot sign registration state. Set X_CLIENT_SECRET.')
  }
  return raw
}

function hmac(secret: string, body: string): Buffer {
  return createHmac('sha256', secret).update(body).digest()
}

function macEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function signRegistrationOAuthState(claims: RegistrationClaims, secret: string): string {
  const body = b64url(Buffer.from(JSON.stringify(claims), 'utf8'))
  const mac = b64url(hmac(secret, `v1.${body}`))
  return `v1.${body}.${mac}`
}

export function verifyRegistrationOAuthState(
  token: string,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
): { ok: true; claims: RegistrationClaims } | { ok: false; error: string; code: 'invalid' | 'expired' } {
  const raw = (token || '').trim()
  const parts = raw.split('.')
  if (parts.length !== 3 || parts[0] !== 'v1' || !parts[1] || !parts[2]) {
    return { ok: false, error: 'invalid', code: 'invalid' }
  }
  const body = parts[1]
  const got = fromB64url(parts[2])
  const want = hmac(secret, `v1.${body}`)
  if (!macEqual(got, want)) {
    return { ok: false, error: 'invalid', code: 'invalid' }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(fromB64url(body).toString('utf8'))
  } catch {
    return { ok: false, error: 'invalid', code: 'invalid' }
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'invalid', code: 'invalid' }
  }
  const c = parsed as Partial<RegistrationClaims>
  if (
    c.v !== 1 ||
    typeof c.sid !== 'string' ||
    !/^[a-f0-9]{32}$/i.test(c.sid) ||
    typeof c.w !== 'string' ||
    (c.w.length > 0 && c.w.length < 32) ||
    typeof c.sh !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(c.sh) ||
    typeof c.exp !== 'number' ||
    !Number.isFinite(c.exp)
  ) {
    return { ok: false, error: 'invalid', code: 'invalid' }
  }
  if (nowSec >= c.exp) {
    return { ok: false, error: SESSION_EXPIRED_ERROR, code: 'expired' }
  }
  const claims: RegistrationClaims = {
    v: 1,
    sid: c.sid.toLowerCase(),
    w: c.w.trim(),
    sh: c.sh.toLowerCase(),
    exp: c.exp,
  }
  if (typeof c.r === 'string' && c.r.trim()) claims.r = c.r.trim()
  if (typeof c.e === 'string' && c.e.trim()) claims.e = c.e.trim()
  return { ok: true, claims }
}

export type ParsedOAuthState =
  | { kind: 'signed'; claims: RegistrationClaims }
  | { kind: 'legacy'; sid: string }
  | { kind: 'expired' }
  | { kind: 'invalid' }

export function parseOAuthStateParam(
  state: string,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
): ParsedOAuthState {
  const raw = (state || '').trim()
  if (!raw) return { kind: 'invalid' }
  if (raw.startsWith('v1.')) {
    const verified = verifyRegistrationOAuthState(raw, secret, nowSec)
    if (verified.ok) return { kind: 'signed', claims: verified.claims }
    if (verified.code === 'expired') return { kind: 'expired' }
    return { kind: 'invalid' }
  }
  if (LEGACY_SID.test(raw)) return { kind: 'legacy', sid: raw.toLowerCase() }
  return { kind: 'invalid' }
}

function rowExpired(row: StoredOAuthState, nowMs: number): boolean {
  return nowMs - row.createdAtMs > REGISTRATION_OAUTH_TTL_MS
}

function bindError(
  claims: RegistrationClaims | null,
  row: StoredOAuthState,
): ResolveErr | null {
  if (row.consumedAtMs) {
    return { ok: false, error: SESSION_USED_ERROR, code: 'used' }
  }
  if (claims && claims.w !== row.wallet) {
    return {
      ok: false,
      error: 'Registration state does not match this wallet. Start again.',
      code: 'mismatch',
    }
  }
  if (claims && row.sigSha256 && claims.sh !== row.sigSha256) {
    return {
      ok: false,
      error: 'Registration state does not match the wallet signature. Start again.',
      code: 'mismatch',
    }
  }
  return null
}

/**
 * Resolve the in-flight registration from the OAuth `state` param (signed or
 * legacy sid) or, if that fails, from the `crew_reg` cookie. Does not consume.
 */
export async function resolveRegistrationOAuth(input: {
  stateParam: string
  regCookie?: string
  now?: number
  secret: string
  getBySid: (sid: string) => Promise<StoredOAuthState | null>
  getByCookieSha: (sha: string) => Promise<StoredOAuthState | null>
}): Promise<ResolveOk | ResolveErr> {
  const nowMs = input.now ?? Date.now()
  const nowSec = Math.floor(nowMs / 1000)
  const parsed = parseOAuthStateParam(input.stateParam, input.secret, nowSec)
  const cookie = (input.regCookie || '').trim()

  if (parsed.kind === 'expired') {
    return { ok: false, error: SESSION_EXPIRED_ERROR, code: 'expired' }
  }

  if (parsed.kind === 'signed' || parsed.kind === 'legacy') {
    const sid = parsed.kind === 'signed' ? parsed.claims.sid : parsed.sid
    const claims = parsed.kind === 'signed' ? parsed.claims : null
    const row = await input.getBySid(sid)
    if (!row) {
      return { ok: false, error: SESSION_USED_ERROR, code: 'used' }
    }
    if (rowExpired(row, nowMs)) {
      return { ok: false, error: SESSION_EXPIRED_ERROR, code: 'expired' }
    }
    const bound = bindError(claims, row)
    if (bound) return bound
    // Cookie is corroboration only. A mismatch (second start overwrote it, or
    // callback landed in another browser) must not fail a valid signed state.
    return {
      ok: true,
      row,
      source: parsed.kind === 'signed' ? 'signed' : 'legacy',
    }
  }

  if (cookie) {
    const row = await input.getByCookieSha(cookieSha256(cookie))
    if (row && !rowExpired(row, nowMs)) {
      const bound = bindError(null, row)
      if (bound) return bound
      return { ok: true, row, source: 'cookie' }
    }
  }

  return { ok: false, error: SESSION_MISSING_ERROR, code: 'missing' }
}

export function walletLinkedElsewhereError(existingHandle: string): string {
  const h = existingHandle.replace(/^@+/, '')
  return `This Solana wallet is already linked to @${h}. Connect a different wallet to register another X account, or keep using @${h}.`
}
