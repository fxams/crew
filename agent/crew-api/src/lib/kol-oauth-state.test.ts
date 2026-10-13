import { describe, expect, it } from 'vitest'
import {
  CROSS_CONTEXT_HINT,
  cookieSha256,
  parseOAuthStateParam,
  REGISTRATION_OAUTH_TTL_MS,
  resolveRegistrationOAuth,
  SESSION_EXPIRED_ERROR,
  SESSION_MISSING_ERROR,
  SESSION_USED_ERROR,
  isRecoverableXOauthError,
  sha256Hex,
  signRegistrationOAuthState,
  verifyRegistrationOAuthState,
  walletLinkedElsewhereError,
  xOauthErrorFlag,
  type RegistrationClaims,
  type StoredOAuthState,
} from './kol-oauth-state.js'

const SECRET = 'test-x-client-secret'
const WALLET = '8x3KqP7nR2mYvC4wL9tHjF6sD1aB0eU5gN8cQ3zW7pXk'
const SIG_SHA = sha256Hex('wallet-signature-bytes')

function claims(over: Partial<RegistrationClaims> = {}): RegistrationClaims {
  return {
    v: 1,
    sid: 'ab'.repeat(16),
    w: WALLET,
    sh: SIG_SHA,
    exp: Math.floor(Date.now() / 1000) + 600,
    r: 'alice',
    e: '0x1111111111111111111111111111111111111111',
    ...over,
  }
}

function row(over: Partial<StoredOAuthState> = {}): StoredOAuthState {
  return {
    sid: 'ab'.repeat(16),
    codeVerifier: 'verifier-abc',
    wallet: WALLET,
    sigSha256: SIG_SHA,
    referralCode: 'alice',
    evmWallet: '0x1111111111111111111111111111111111111111',
    cookieSha256: cookieSha256('cookie-one'),
    ip: '1.1.1.1',
    createdAtMs: Date.now() - 1_000,
    consumedAtMs: null,
    ...over,
  }
}

describe('signed registration OAuth state', () => {
  it('round-trips X-only state with an empty wallet', () => {
    const token = signRegistrationOAuthState(claims({ w: '', sh: sha256Hex('x-only:sid') }), SECRET)
    const verified = verifyRegistrationOAuthState(token, SECRET)
    expect(verified.ok).toBe(true)
    if (!verified.ok) return
    expect(verified.claims.w).toBe('')
    expect(verified.claims.sh).toBe(sha256Hex('x-only:sid'))
  })

  it('round-trips a payload bound to wallet + signature hash', () => {
    const token = signRegistrationOAuthState(claims(), SECRET)
    expect(token.startsWith('v1.')).toBe(true)
    const verified = verifyRegistrationOAuthState(token, SECRET)
    expect(verified.ok).toBe(true)
    if (!verified.ok) return
    expect(verified.claims.w).toBe(WALLET)
    expect(verified.claims.sh).toBe(SIG_SHA)
    expect(verified.claims.r).toBe('alice')
    expect(verified.claims.e).toBe('0x1111111111111111111111111111111111111111')
  })

  it('rejects a tampered payload and a wrong secret', () => {
    const token = signRegistrationOAuthState(claims(), SECRET)
    const bits = token.split('.')
    const body = Buffer.from(bits[1]!, 'base64url').toString('utf8')
    const tweaked = Buffer.from(body.replace(WALLET, '9'.repeat(44))).toString('base64url')
    expect(verifyRegistrationOAuthState(`v1.${tweaked}.${bits[2]}`, SECRET).ok).toBe(false)
    expect(verifyRegistrationOAuthState(token, 'other-secret').ok).toBe(false)
  })

  it('rejects expired tokens', () => {
    const token = signRegistrationOAuthState(claims({ exp: 1_700_000_000 }), SECRET)
    const verified = verifyRegistrationOAuthState(token, SECRET, 1_700_000_001)
    expect(verified.ok).toBe(false)
    if (verified.ok) return
    expect(verified.code).toBe('expired')
    expect(parseOAuthStateParam(token, SECRET, 1_700_000_001).kind).toBe('expired')
  })

  it('parses legacy 32-hex state ids', () => {
    expect(parseOAuthStateParam('ab'.repeat(16), SECRET)).toEqual({
      kind: 'legacy',
      sid: 'ab'.repeat(16),
    })
  })
})

describe('resolveRegistrationOAuth', () => {
  it('completes from signed state without a cookie', async () => {
    const stored = row()
    const token = signRegistrationOAuthState(claims(), SECRET)
    const out = await resolveRegistrationOAuth({
      stateParam: token,
      regCookie: '',
      secret: SECRET,
      getBySid: async (sid) => (sid === stored.sid ? stored : null),
      getByCookieSha: async () => null,
    })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.source).toBe('signed')
    expect(out.row.codeVerifier).toBe('verifier-abc')
  })

  it('ignores a cookie overwritten by a second start when signed state is valid', async () => {
    const first = row()
    const token = signRegistrationOAuthState(claims(), SECRET)
    const out = await resolveRegistrationOAuth({
      stateParam: token,
      regCookie: 'cookie-from-second-account',
      secret: SECRET,
      getBySid: async () => first,
      getByCookieSha: async () => {
        throw new Error('must not fall back to the overwritten cookie')
      },
    })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.source).toBe('signed')
    expect(out.row.sid).toBe(first.sid)
  })

  it('falls back to the cookie when the state token is unreadable', async () => {
    const stored = row({ sid: 'cd'.repeat(16) })
    const out = await resolveRegistrationOAuth({
      stateParam: 'not-a-token',
      regCookie: 'cookie-one',
      secret: SECRET,
      getBySid: async () => {
        throw new Error('must not look up a garbage sid')
      },
      getByCookieSha: async (sha) => (sha === cookieSha256('cookie-one') ? stored : null),
    })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.source).toBe('cookie')
    expect(out.row.sid).toBe(stored.sid)
  })

  it('falls back to cookie for a legacy sid-less callback in another context', async () => {
    const stored = row()
    const out = await resolveRegistrationOAuth({
      stateParam: '',
      regCookie: 'cookie-one',
      secret: SECRET,
      getBySid: async () => null,
      getByCookieSha: async () => stored,
    })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.source).toBe('cookie')
  })

  it('does not require a cookie for a legacy 32-hex state id', async () => {
    const stored = row()
    const out = await resolveRegistrationOAuth({
      stateParam: stored.sid,
      secret: SECRET,
      getBySid: async () => stored,
      getByCookieSha: async () => null,
    })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.source).toBe('legacy')
  })

  it('resolves X-only state with an empty wallet row', async () => {
    const sh = sha256Hex('x-only:sid')
    const stored = row({ wallet: '', sigSha256: sh })
    const token = signRegistrationOAuthState(claims({ w: '', sh }), SECRET)
    const out = await resolveRegistrationOAuth({
      stateParam: token,
      regCookie: '',
      secret: SECRET,
      getBySid: async () => stored,
      getByCookieSha: async () => null,
    })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.source).toBe('signed')
    expect(out.row.wallet).toBe('')
  })

  it('rejects a used (consumed) row', async () => {
    const stored = row({ consumedAtMs: Date.now() - 100 })
    const token = signRegistrationOAuthState(claims(), SECRET)
    const out = await resolveRegistrationOAuth({
      stateParam: token,
      secret: SECRET,
      getBySid: async () => stored,
      getByCookieSha: async () => null,
    })
    expect(out).toEqual({ ok: false, error: SESSION_USED_ERROR, code: 'used' })
    expect(SESSION_USED_ERROR).toContain(CROSS_CONTEXT_HINT)
  })

  it('rejects an expired server row', async () => {
    const stored = row({ createdAtMs: Date.now() - REGISTRATION_OAUTH_TTL_MS - 1_000 })
    const token = signRegistrationOAuthState(claims(), SECRET)
    const out = await resolveRegistrationOAuth({
      stateParam: token,
      secret: SECRET,
      getBySid: async () => stored,
      getByCookieSha: async () => null,
    })
    expect(out).toEqual({ ok: false, error: SESSION_EXPIRED_ERROR, code: 'expired' })
  })

  it('rejects a wallet mismatch between signed claims and the stored row', async () => {
    const stored = row({ wallet: '9'.repeat(44) })
    const token = signRegistrationOAuthState(claims(), SECRET)
    const out = await resolveRegistrationOAuth({
      stateParam: token,
      secret: SECRET,
      getBySid: async () => stored,
      getByCookieSha: async () => null,
    })
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.code).toBe('mismatch')
  })

  it('rejects a signature-hash mismatch', async () => {
    const stored = row({ sigSha256: sha256Hex('other-sig') })
    const token = signRegistrationOAuthState(claims(), SECRET)
    const out = await resolveRegistrationOAuth({
      stateParam: token,
      secret: SECRET,
      getBySid: async () => stored,
      getByCookieSha: async () => null,
    })
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.code).toBe('mismatch')
  })

  it('does not cookie-fallback an expired signed token (avoids mixing OAuth codes)', async () => {
    const token = signRegistrationOAuthState(claims({ exp: 10 }), SECRET)
    const out = await resolveRegistrationOAuth({
      stateParam: token,
      regCookie: 'cookie-one',
      secret: SECRET,
      now: 11_000,
      getBySid: async () => row(),
      getByCookieSha: async () => {
        throw new Error('must not cookie-fallback an expired signed state')
      },
    })
    expect(out).toEqual({ ok: false, error: SESSION_EXPIRED_ERROR, code: 'expired' })
  })

  it('explains a missing cookie AND missing state with the Check path', async () => {
    const out = await resolveRegistrationOAuth({
      stateParam: '',
      regCookie: '',
      secret: SECRET,
      getBySid: async () => null,
      getByCookieSha: async () => null,
    })
    expect(out).toEqual({ ok: false, error: SESSION_MISSING_ERROR, code: 'missing' })
    expect(SESSION_MISSING_ERROR).toContain(CROSS_CONTEXT_HINT)
    expect(SESSION_MISSING_ERROR).not.toMatch(/Missing registration cookie/)
  })
})

describe('recoverable X OAuth errors', () => {
  it('flags already-used and expired callback copy', () => {
    expect(xOauthErrorFlag(SESSION_USED_ERROR)).toBe('used')
    expect(xOauthErrorFlag(SESSION_EXPIRED_ERROR)).toBe('expired')
    expect(xOauthErrorFlag('Unknown referral code.')).toBeNull()
    expect(isRecoverableXOauthError(SESSION_USED_ERROR)).toBe(true)
    expect(isRecoverableXOauthError(SESSION_EXPIRED_ERROR)).toBe(true)
    expect(isRecoverableXOauthError(SESSION_MISSING_ERROR)).toBe(true)
    expect(isRecoverableXOauthError(null, 'used')).toBe(true)
    expect(isRecoverableXOauthError('Unknown referral code.')).toBe(false)
  })
})

describe('re-register copy', () => {
  it('names the existing X account when the wallet is taken', () => {
    expect(walletLinkedElsewhereError('Alice')).toContain('@Alice')
    expect(walletLinkedElsewhereError('@Alice')).toContain('different wallet')
  })
})
