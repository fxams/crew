import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import nacl from 'tweetnacl'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const inserted: unknown[][] = []
const nonces = new Set<string>()

vi.mock('./db.js', () => ({
  query: vi.fn(async (sql: string, params?: unknown[]) => {
    const s = sql.replace(/\s+/g, ' ')
    if (s.includes('DELETE FROM kol_oauth_nonces')) {
      const nonce = String(params?.[0] || '')
      const wallet = String(params?.[1] || '')
      const key = `${nonce}:${wallet}`
      if (nonces.has(key)) {
        nonces.delete(key)
        return { rows: [{ nonce }] }
      }
      return { rows: [] }
    }
    if (s.includes('INSERT INTO kol_oauth_states')) {
      inserted.push([...(params || [])])
      return { rows: [], rowCount: 1 }
    }
    if (s.includes('DELETE FROM kol_oauth_states')) return { rows: [] }
    if (s.includes('FROM kol_registrations')) return { rows: [] }
    return { rows: [] }
  }),
}))

import { beginXAuth, registrationMessage } from './kol-register.js'
import { parseOAuthStateParam, sha256Hex } from './kol-oauth-state.js'

describe('beginXAuth signed OAuth state', () => {
  beforeEach(() => {
    inserted.length = 0
    nonces.clear()
    process.env.X_CLIENT_ID = 'test-client-id'
    process.env.X_CLIENT_SECRET = 'test-client-secret'
  })

  it('puts a signature-bound token in the authorize URL and stores the server row by sid', async () => {
    const kp = Keypair.generate()
    const wallet = kp.publicKey.toBase58()
    const nonce = 'cd'.repeat(16)
    nonces.add(`${nonce}:${wallet}`)
    const message = registrationMessage(wallet, nonce)
    const sig = nacl.sign.detached(new TextEncoder().encode(message), kp.secretKey)
    const signature = bs58.encode(sig)
    const out = await beginXAuth({
      wallet,
      message,
      signature,
      evmWallet: '0x1111111111111111111111111111111111111111',
      ip: '127.0.0.1',
      regCookie: 'fallback-cookie',
    })
    const url = new URL(out.authorizeUrl)
    const state = url.searchParams.get('state') || ''
    expect(state.startsWith('v1.')).toBe(true)
    expect(out.state).toBe(state)
    expect(out.sid).toMatch(/^[a-f0-9]{32}$/)
    expect(out.wallet).toBe(wallet)
    expect(out.expiresAt).toBeGreaterThan(Date.now())

    const parsed = parseOAuthStateParam(state, 'test-client-secret')
    expect(parsed.kind).toBe('signed')
    if (parsed.kind !== 'signed') return
    expect(parsed.claims.w).toBe(wallet)
    expect(parsed.claims.sh).toBe(sha256Hex(signature))
    expect(parsed.claims.e).toBe('0x1111111111111111111111111111111111111111')
    expect(inserted).toHaveLength(1)
    expect(out.sid).toBe(parsed.claims.sid)
    expect(inserted[0]?.[0]).toBe(parsed.claims.sid)
    expect(inserted[0]?.[2]).toBe(wallet)
    expect(inserted[0]?.[8]).toBe(parsed.claims.sh)
  })

  it('starts X-only registration without a wallet signature', async () => {
    const out = await beginXAuth({
      referralCode: undefined,
      ip: '127.0.0.1',
      regCookie: 'fallback-cookie',
    })
    const url = new URL(out.authorizeUrl)
    const state = url.searchParams.get('state') || ''
    expect(state.startsWith('v1.')).toBe(true)
    expect(out.sid).toMatch(/^[a-f0-9]{32}$/)
    expect(out.wallet).toBe('')
    const parsed = parseOAuthStateParam(state, 'test-client-secret')
    expect(parsed.kind).toBe('signed')
    if (parsed.kind !== 'signed') return
    expect(parsed.claims.w).toBe('')
    expect(parsed.claims.sh).toMatch(/^[a-f0-9]{64}$/)
    expect(inserted[0]?.[2]).toBe('')
  })
})
