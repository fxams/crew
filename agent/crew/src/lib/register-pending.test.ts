import { describe, expect, it } from 'vitest'
import {
  AUTORESTART_COOLDOWN_MS,
  AUTORESTART_KEY,
  PENDING_REG_KEY,
  PENDING_REG_TTL_MS,
  STUCK_OAUTH_KEY,
  clearPendingRegistration,
  classifyStuckXOauth,
  clearStuckXOauth,
  humanizeRegisterError,
  isRecoverableXOauthError,
  loadPendingRegistration,
  loadStuckXOauth,
  parsePendingRegistration,
  savePendingRegistration,
  saveStuckXOauth,
  serializePendingRegistration,
  stuckXOauthMessage,
  takeXOauthAutoRestart,
} from './register-pending'

function memoryStore(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial))
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (key: string) => {
      map.delete(key)
    },
    setItem: (key: string, value: string) => {
      map.set(key, value)
    },
  } as Storage
}

describe('pending KOL registration', () => {
  it('round-trips a wallet started-at payload', () => {
    const wallet = '8x3KqP7nR2mYvC4wL9tHjF6sD1aB0eU5gN8cQ3zW7pXk'
    const raw = serializePendingRegistration({ wallet, startedAt: 1_700_000_000_000 })
    expect(parsePendingRegistration(raw, 1_700_000_000_000)).toEqual({
      wallet,
      startedAt: 1_700_000_000_000,
    })
  })

  it('round-trips an OAuth sid for cookie-less Check', () => {
    const wallet = '8x3KqP7nR2mYvC4wL9tHjF6sD1aB0eU5gN8cQ3zW7pXk'
    const sid = 'ab'.repeat(16)
    const raw = serializePendingRegistration({ wallet, startedAt: 1_700_000_000_000, sid })
    expect(parsePendingRegistration(raw, 1_700_000_000_000)).toEqual({
      wallet,
      startedAt: 1_700_000_000_000,
      sid,
    })
  })

  it('drops expired or junk payloads', () => {
    const wallet = '8x3KqP7nR2mYvC4wL9tHjF6sD1aB0eU5gN8cQ3zW7pXk'
    const raw = serializePendingRegistration({ wallet, startedAt: 1_000 })
    expect(parsePendingRegistration(raw, 1_000 + PENDING_REG_TTL_MS + 1)).toBeNull()
    expect(parsePendingRegistration('not-json')).toBeNull()
    expect(parsePendingRegistration('{"wallet":"short","startedAt":1}')).toBeNull()
  })

  it('keeps an X-only pending registration with no wallet yet', () => {
    const raw = serializePendingRegistration({ wallet: '', startedAt: 1_700_000_000_000 })
    expect(parsePendingRegistration(raw, 1_700_000_000_000)).toEqual({
      wallet: '',
      startedAt: 1_700_000_000_000,
    })
  })

  it('writes and loads sid from a provided store', () => {
    const store = memoryStore()
    const sid = 'cd'.repeat(16)
    savePendingRegistration('', 1_700_000_000_000, { sid, storage: store })
    expect(store.getItem(PENDING_REG_KEY)).toContain(sid)
    expect(loadPendingRegistration(store, 1_700_000_000_000)).toEqual({
      wallet: '',
      startedAt: 1_700_000_000_000,
      sid,
    })
    clearPendingRegistration(store)
    expect(loadPendingRegistration(store, 1_700_000_000_000)).toBeNull()
  })
})

describe('recoverable X OAuth errors', () => {
  it('matches already-used, expired, and xoauth flags', () => {
    expect(isRecoverableXOauthError('This sign-in was already used. Return and tap Check.')).toBe(
      true,
    )
    expect(isRecoverableXOauthError('Sign-in expired. Tap Register with X again.')).toBe(true)
    expect(isRecoverableXOauthError('Sign-in session expired or this browser did not start')).toBe(
      true,
    )
    expect(isRecoverableXOauthError(null, 'used')).toBe(true)
    expect(isRecoverableXOauthError('', 'expired')).toBe(true)
    expect(isRecoverableXOauthError('Unknown referral code.')).toBe(false)
    expect(isRecoverableXOauthError(null, 'nope')).toBe(false)
    expect(isRecoverableXOauthError('access_denied', 'cancelled')).toBe(true)
    expect(classifyStuckXOauth('access_denied', 'cancelled')).toBe('cancelled')
    expect(stuckXOauthMessage('cancelled')).toMatch(/cancelled/i)
    expect(humanizeRegisterError('Failed to fetch')).toMatch(/Could not reach CrewPay/i)
  })

  it('persists stuck used/expired so Start over survives a remount', () => {
    const store = memoryStore()
    expect(loadStuckXOauth(store)).toBeNull()
    saveStuckXOauth('used', store)
    expect(store.getItem(STUCK_OAUTH_KEY)).toBe('used')
    expect(loadStuckXOauth(store)).toBe('used')
    expect(stuckXOauthMessage('used')).toMatch(/already used/i)
    expect(stuckXOauthMessage('expired')).toMatch(/expired/i)
    clearStuckXOauth(store)
    expect(loadStuckXOauth(store)).toBeNull()
  })

  it('allows one auto-restart then cools down', () => {
    const store = memoryStore()
    const now = 1_800_000_000_000
    expect(takeXOauthAutoRestart(now, store)).toBe(true)
    expect(store.getItem(AUTORESTART_KEY)).toBe(String(now))
    expect(takeXOauthAutoRestart(now + 1_000, store)).toBe(false)
    expect(takeXOauthAutoRestart(now + AUTORESTART_COOLDOWN_MS + 1, store)).toBe(true)
  })
})
