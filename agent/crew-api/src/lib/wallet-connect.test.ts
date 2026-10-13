import { describe, expect, it } from 'vitest'
import nacl from 'tweetnacl'
import bs58 from 'bs58'
import {
  connectMessage,
  issueConnectNonce,
  issueWalletConnectToken,
  readWalletConnectCookie,
  signWalletConnectSession,
  verifyConnectSignature,
  verifyWalletConnectSession,
  walletConnectCookieHeader,
} from './wallet-connect.js'

function keypair() {
  const kp = nacl.sign.keyPair()
  return { wallet: bs58.encode(kp.publicKey), secret: kp.secretKey }
}

describe('SIWS wallet connect', () => {
  it('issues a sign-in message and accepts a matching signature once', async () => {
    const { wallet, secret } = keypair()
    const issued = await issueConnectNonce(wallet)
    expect(issued.message).toBe(connectMessage(wallet, issued.nonce))
    expect(issued.message).toContain('Sign in to CrewPay')
    const sig = nacl.sign.detached(new TextEncoder().encode(issued.message), secret)
    const verified = await verifyConnectSignature({
      wallet,
      nonce: issued.nonce,
      signature: bs58.encode(sig),
    })
    expect(verified.wallet).toBe(wallet)
    await expect(
      verifyConnectSignature({
        wallet,
        nonce: issued.nonce,
        signature: bs58.encode(sig),
      }),
    ).rejects.toThrow(/already used|expired/i)
  })

  it('rejects a signature over a different message', async () => {
    const { wallet, secret } = keypair()
    const issued = await issueConnectNonce(wallet)
    const sig = nacl.sign.detached(new TextEncoder().encode('not the nonce'), secret)
    await expect(
      verifyConnectSignature({
        wallet,
        nonce: issued.nonce,
        signature: bs58.encode(sig),
      }),
    ).rejects.toThrow(/Invalid wallet signature/)
  })

  it('round-trips a cookie session and rejects expiry', () => {
    const secret = 'wallet-connect-test-secret'
    const wallet = '8x3KqP7nR2mYvC4wL9tHjF6sD1aB0eU5gN8cQ3zW7pXk'
    const token = signWalletConnectSession(
      { v: 1, w: wallet, exp: Math.floor(Date.now() / 1000) + 60 },
      secret,
    )
    const ok = verifyWalletConnectSession(token, secret)
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.claims.w).toBe(wallet)
    const expired = signWalletConnectSession({ v: 1, w: wallet, exp: 10 }, secret)
    expect(verifyWalletConnectSession(expired, secret, 11).ok).toBe(false)
    const header = walletConnectCookieHeader(token)
    expect(header).toContain('crew_wallet=')
    expect(header).toContain('HttpOnly')
    process.env.WALLET_SESSION_SECRET = secret
    expect(issueWalletConnectToken(wallet)).toBeTruthy()
    const claims = readWalletConnectCookie(`crew_wallet=${encodeURIComponent(token)}`, secret)
    expect(claims?.w).toBe(wallet)
  })
})
