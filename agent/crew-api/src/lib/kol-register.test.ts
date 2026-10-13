import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import nacl from 'tweetnacl'
import { describe, expect, it } from 'vitest'
import {
  classifyRegistrationProgress,
  codeChallengeS256,
  isDefaultXProfileImage,
  normalizeReferralCode,
  REFERRAL_POINTS_HIRE,
  REFERRAL_POINTS_MIN_FOLLOWERS,
  REFERRAL_POINTS_REGISTER,
  REFERRAL_POINTS_REGISTER_DAILY_CAP,
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

  it('defines positive airdrop point weights and sybil brakes', () => {
    expect(REFERRAL_POINTS_REGISTER).toBe(100)
    expect(REFERRAL_POINTS_HIRE).toBe(250)
    expect(REFERRAL_POINTS_MIN_FOLLOWERS).toBe(50)
    expect(REFERRAL_POINTS_REGISTER_DAILY_CAP).toBe(10)
  })
})

describe('registration progress classifier', () => {
  const now = 1_800_000_000_000

  it('returns unknown when the sid row is gone', () => {
    expect(
      classifyRegistrationProgress({
        found: false,
        consumed: false,
        createdAtMs: now,
        now,
      }),
    ).toEqual({ status: 'unknown' })
  })

  it('returns done from completed_username even with an empty wallet', () => {
    expect(
      classifyRegistrationProgress({
        found: true,
        consumed: true,
        createdAtMs: now - 1_000,
        completedUsername: '@Alice',
        wallet: '',
        now,
      }),
    ).toEqual({ status: 'done', handle: 'Alice' })
  })

  it('asks for a wallet lookup when consumed without a handle', () => {
    const wallet = Keypair.generate().publicKey.toBase58()
    expect(
      classifyRegistrationProgress({
        found: true,
        consumed: true,
        createdAtMs: now - 1_000,
        wallet,
        now,
      }),
    ).toEqual({ status: 'lookup_wallet', wallet })
  })

  it('returns used for a consumed X-only row with no handle yet', () => {
    expect(
      classifyRegistrationProgress({
        found: true,
        consumed: true,
        createdAtMs: now - 1_000,
        wallet: '',
        now,
      }),
    ).toEqual({ status: 'used' })
  })

  it('returns expired or pending for an unused row', () => {
    expect(
      classifyRegistrationProgress({
        found: true,
        consumed: false,
        createdAtMs: now - 11 * 60_000,
        now,
      }),
    ).toEqual({ status: 'expired' })
    expect(
      classifyRegistrationProgress({
        found: true,
        consumed: false,
        createdAtMs: now - 1_000,
        now,
      }),
    ).toEqual({ status: 'pending' })
  })
})

describe('KOL EVM wallet', () => {
  it('accepts checksum 0x addresses and rejects junk', async () => {
    const { isEvmAddress } = await import('./agent/evm-address.js')
    expect(isEvmAddress('0x1111111111111111111111111111111111111111')).toBe(true)
    expect(isEvmAddress('not-an-address')).toBe(false)
    expect(isEvmAddress('11111111111111111111111111111111')).toBe(false)
  })
})
