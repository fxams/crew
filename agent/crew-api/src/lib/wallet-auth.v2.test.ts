import { describe, it, expect } from 'vitest'
import nacl from 'tweetnacl'
import bs58 from 'bs58'
import type { Request } from 'express'
import { issueBoardNonce } from './board-nonces.js'
import { walletBoardSignatureFreshV2 } from './wallet-auth.js'

function mockReq(headers: Record<string, string>, body: unknown): Request {
  return {
    header(name: string) {
      const v = headers[name.toLowerCase()] || headers[name] || ''
      return v
    },
    body,
  } as unknown as Request
}

describe('wallet board v2 auth', () => {
  it('rejects replay with modified body (sha256 mismatch)', async () => {
    const kp = nacl.sign.keyPair()
    const wallet = bs58.encode(kp.publicKey)
    const mint = '11111111111111111111111111111111'
    const timestamp = Date.now()
    const { nonce } = await issueBoardNonce(wallet)
    const encoder = new TextEncoder()
    // Correct message for body A
    const bodyA = { mint, x: 1, y: 'a' }
    const canonicalA = JSON.stringify({ mint: mint, x: 1, y: 'a' })
    // sha256 of canonicalA
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(canonicalA))
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    const msg = `crew-board:${mint}:${hex}:${nonce}:${timestamp}`
    const sig = nacl.sign.detached(encoder.encode(msg), kp.secretKey)
    const headers = {
      'x-crew-wallet': wallet,
      'x-crew-timestamp': String(timestamp),
      'x-crew-signature': bs58.encode(sig),
      'x-crew-mint': mint,
      'x-crew-nonce': nonce,
    }
    // Tampered body B
    const bodyB = { mint, x: 2, y: 'a' }
    const fresh = await walletBoardSignatureFreshV2(mockReq(headers, bodyB))
    expect(fresh).toBeNull()
  })
})

