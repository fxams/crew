import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import nacl from 'tweetnacl'
import { describe, expect, it } from 'vitest'
import {
  WALLET_CHANGE_PENDING_MS,
  buildWalletChangeMessage,
  decideWalletChange,
} from './kol-register.js'
import { parseOAuthStateParam, signRegistrationOAuthState } from './kol-oauth-state.js'

describe('KOL wallet change takeover protection', () => {
  const current = Keypair.generate()
  const next = Keypair.generate()
  const currentWallet = current.publicKey.toBase58()
  const newWallet = next.publicKey.toBase58()

  it('without current-wallet signature, change becomes pending and keeps current wallet', () => {
    const now = Date.UTC(2026, 0, 1)
    const decision = decideWalletChange({
      currentWallet,
      newWallet,
      nowMs: now,
    })
    expect(decision.action).toBe('pending')
    expect(decision.wallet).toBe(currentWallet)
    expect(decision.pendingWallet).toBe(newWallet)
    expect(decision.pendingUntil?.getTime()).toBe(now + WALLET_CHANGE_PENDING_MS)
    expect(decision.wallet).not.toBe(newWallet)
  })

  it('applies immediately when current wallet signs crew-kol-wallet-change', () => {
    const ts = Date.now()
    const message = buildWalletChangeMessage(newWallet, ts)
    const sig = nacl.sign.detached(new TextEncoder().encode(message), current.secretKey)
    const decision = decideWalletChange({
      currentWallet,
      newWallet,
      changeSignature: bs58.encode(sig),
      changeTimestamp: ts,
      nowMs: ts,
    })
    expect(decision).toEqual({
      action: 'set',
      wallet: newWallet,
      pendingWallet: null,
      pendingUntil: null,
    })
  })

  it('rejects a signature from the new wallet (attacker)', () => {
    const ts = Date.now()
    const message = buildWalletChangeMessage(newWallet, ts)
    const sig = nacl.sign.detached(new TextEncoder().encode(message), next.secretKey)
    const decision = decideWalletChange({
      currentWallet,
      newWallet,
      changeSignature: bs58.encode(sig),
      changeTimestamp: ts,
      nowMs: ts,
    })
    expect(decision.action).toBe('pending')
    expect(decision.wallet).toBe(currentWallet)
  })
})

describe('signed OAuth state remains source of truth (cookie optional)', () => {
  it('parses HMAC-signed registration state without a crew_reg cookie', () => {
    const claims = {
      v: 1 as const,
      sid: 'ab'.repeat(16),
      w: '8x3KqP7nR2mYvC4wL9tHjF6sD1aB0eU5gN8cQ3zW7pXk',
      sh: 'aa'.repeat(32),
      exp: Math.floor(Date.now() / 1000) + 600,
    }
    const token = signRegistrationOAuthState(claims, 'test-secret')
    const parsed = parseOAuthStateParam(token, 'test-secret')
    expect(parsed.kind).toBe('signed')
    if (parsed.kind !== 'signed') return
    expect(parsed.claims.sid).toBe(claims.sid)
    expect(parsed.claims.w).toBe(claims.w)
  })
})
