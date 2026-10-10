import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import nacl from 'tweetnacl'
import { describe, expect, it } from 'vitest'
import {
  codeChallengeS256,
  isDefaultXProfileImage,
  normalizeReferralCode,
  referralCodeFromUsername,
  registrationMessage,
  verifyWalletLink,
  xAvatarLarge,
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

  it('detects X default profile images', () => {
    expect(
      isDefaultXProfileImage(
        'https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png',
      ),
    ).toBe(true)
    expect(
      isDefaultXProfileImage(
        'https://pbs.twimg.com/profile_images/2108774391135772672/ns7zqcTn_400x400.jpg',
      ),
    ).toBe(false)
  })

  it('upgrades an X avatar to the large size', () => {
    expect(xAvatarLarge('https://pbs.twimg.com/profile_images/1/a_normal.jpg')).toBe(
      'https://pbs.twimg.com/profile_images/1/a_400x400.jpg',
    )
    expect(xAvatarLarge(null)).toBeNull()
  })

  it('builds an S256 code challenge without padding', () => {
    const challenge = codeChallengeS256('crew-pay-verifier-example')
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(challenge.includes('=')).toBe(false)
  })

  it('normalizes referral codes from handles', () => {
    expect(normalizeReferralCode('@CrewPayHQ')).toBe('crewpayhq')
    expect(normalizeReferralCode('  Foo-Bar!! ')).toBe('foobar')
    expect(referralCodeFromUsername('alice')).toBe('alice')
    expect(referralCodeFromUsername('a')).toMatch(/^crew[a-f0-9]{6}$/)
  })
})
