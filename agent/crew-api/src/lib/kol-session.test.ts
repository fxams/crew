import { describe, expect, it } from 'vitest'
import {
  issueKolSessionToken,
  kolSessionCookieHeader,
  signKolSession,
  verifyKolSession,
} from './kol-session.js'

const SECRET = 'test-kol-session-secret'

describe('KOL desk session', () => {
  it('round-trips a signed session bound to the X user', () => {
    const token = signKolSession(
      { v: 1, u: 'x-user-1', h: 'alice', exp: Math.floor(Date.now() / 1000) + 600 },
      SECRET,
    )
    expect(token.startsWith('ks1.')).toBe(true)
    const verified = verifyKolSession(token, SECRET)
    expect(verified.ok).toBe(true)
    if (!verified.ok) return
    expect(verified.claims.u).toBe('x-user-1')
    expect(verified.claims.h).toBe('alice')
  })

  it('rejects a tampered token, wrong secret, and expiry', () => {
    const token = signKolSession(
      { v: 1, u: 'x-user-1', h: 'alice', exp: Math.floor(Date.now() / 1000) + 600 },
      SECRET,
    )
    expect(verifyKolSession(token, 'other').ok).toBe(false)
    const bits = token.split('.')
    expect(verifyKolSession(`ks1.${bits[1]}.aaaa`, SECRET).ok).toBe(false)
    const expired = signKolSession({ v: 1, u: 'x-user-1', h: 'alice', exp: 10 }, SECRET)
    expect(verifyKolSession(expired, SECRET, 11).ok).toBe(false)
  })

  it('sets SameSite=None so SPA Check can send the cookie cross-site', () => {
    const header = kolSessionCookieHeader('ks1.test')
    expect(header).toMatch(/SameSite=None/)
    expect(header).toMatch(/Secure/)
    expect(header).not.toMatch(/SameSite=Lax/)
  })

  it('issues a live token when X secret is set', () => {
    process.env.X_CLIENT_SECRET = SECRET
    const token = issueKolSessionToken({ xUserId: '42', username: '@Bob' })
    const verified = verifyKolSession(token, SECRET)
    expect(verified.ok).toBe(true)
    if (!verified.ok) return
    expect(verified.claims.h).toBe('Bob')
    expect(verified.claims.u).toBe('42')
  })
})

