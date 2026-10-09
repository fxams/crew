import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import nacl from 'tweetnacl'
import { describe, expect, it } from 'vitest'
import {
  codeChallengeS256,
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

  it('builds an S256 code challenge without padding', () => {
    const challenge = codeChallengeS256('crew-pay-verifier-example')
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(challenge.includes('=')).toBe(false)
  })
})
