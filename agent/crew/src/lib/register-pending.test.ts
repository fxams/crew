import { describe, expect, it } from 'vitest'
import {
  PENDING_REG_TTL_MS,
  parsePendingRegistration,
  serializePendingRegistration,
} from './register-pending'

describe('pending KOL registration', () => {
  it('round-trips a wallet started-at payload', () => {
    const wallet = '8x3KqP7nR2mYvC4wL9tHjF6sD1aB0eU5gN8cQ3zW7pXk'
    const raw = serializePendingRegistration({ wallet, startedAt: 1_700_000_000_000 })
    expect(parsePendingRegistration(raw, 1_700_000_000_000)).toEqual({
      wallet,
      startedAt: 1_700_000_000_000,
    })
  })

  it('drops expired or junk payloads', () => {
    const wallet = '8x3KqP7nR2mYvC4wL9tHjF6sD1aB0eU5gN8cQ3zW7pXk'
    const raw = serializePendingRegistration({ wallet, startedAt: 1_000 })
    expect(parsePendingRegistration(raw, 1_000 + PENDING_REG_TTL_MS + 1)).toBeNull()
    expect(parsePendingRegistration('not-json')).toBeNull()
    expect(parsePendingRegistration('{"wallet":"short","startedAt":1}')).toBeNull()
  })
})
