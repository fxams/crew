import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import nacl from 'tweetnacl'
import { describe, expect, it } from 'vitest'
import {
  codeChallengeS256,
  explainXError,
  phantomBrowseUrl,
  registrationMessage,
  verifyWalletLink,
} from './kol-register.js'

describe('KOL registration wallet link', () => {
  it('accepts a signature over the registration message', () => {
    const kp = Keypair.generate()
    const wallet = kp.publicKey.toBase58()
    const message = registrationMessage(wallet, 'ab'.repeat(16))
    const sig = nacl.sign.detached(new TextEncoder().encode(message), kp.secretKey)
    expect(verifyWalletLink(wallet, message, bs58.encode(sig))).toBe(true)
  })

  it('rejects a signature from a different wallet', () => {
    const signer = Keypair.generate()
    const other = Keypair.generate().publicKey.toBase58()
    const message = registrationMessage(other, 'cd'.repeat(16))
    const sig = nacl.sign.detached(new TextEncoder().encode(message), signer.secretKey)
    expect(verifyWalletLink(other, message, bs58.encode(sig))).toBe(false)
  })

  it('explains the standalone-app rejection from X', () => {
    const raw =
      'When authenticating requests to the X API v2 endpoints, you must use keys and tokens from a developer App that is attached to a Project.'
    expect(explainXError(raw)).toMatch(/Standalone Apps/)
    expect(explainXError('invalid_grant')).toBe('invalid_grant')
  })

  it('builds a Phantom browse link back to the register page', () => {
    const previous = process.env.SITE_URL
    process.env.SITE_URL = 'https://crewpay.dev'
    const url = phantomBrowseUrl('https://crewpay.dev/register?registered=1&handle=crew')
    expect(url.startsWith('https://phantom.com/ul/browse/')).toBe(true)
    expect(url).toContain(encodeURIComponent('https://crewpay.dev/register?registered=1&handle=crew'))
    expect(url).toContain(`ref=${encodeURIComponent('https://crewpay.dev')}`)
    if (previous === undefined) delete process.env.SITE_URL
    else process.env.SITE_URL = previous
  })

  it('builds an S256 code challenge without padding', () => {
    const challenge = codeChallengeS256('crew-pay-verifier-example')
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(challenge.includes('=')).toBe(false)
  })
})
