import { Keypair } from '@solana/web3.js'
import { describe, expect, it } from 'vitest'
import {
  AGENT_REFERRAL_BPS,
  MAX_CREW_REFERRED,
  MAX_CREW_UNREFERRED,
  PLATFORM_BUYBACK_BPS,
} from './constants.js'
import {
  agentReferrerDualRoleHandles,
  buildCrewShareholders,
  isPayoutWallet,
  maxCrewSeats,
  normalizeCrew,
  normalizeShareholderRole,
  skipCrewWithoutPayoutWallets,
} from './shareholders.js'
import type { CrewMember } from './narrative.js'

const platform = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
const desk = 'SysvarRent111111111111111111111111111111111'
const kolA = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const kolB = 'So11111111111111111111111111111111111111112'
const referrer = 'Stake11111111111111111111111111111111111111'

function freshWallets(n: number): string[] {
  return Array.from({ length: n }, () => Keypair.generate().publicKey.toBase58())
}

function equalCrew(wallets: string[]): CrewMember[] {
  const share = Math.floor(100 / wallets.length)
  const rem = 100 - share * wallets.length
  return wallets.map((wallet, i) => ({
    handle: `@k${i}`,
    wallet,
    share: share + (i < rem ? 1 : 0),
    hireRole: 'kol' as const,
  }))
}

describe('wallet-less crew safety', () => {
  it('isPayoutWallet rejects empty and junk destinations', () => {
    expect(isPayoutWallet('')).toBe(false)
    expect(isPayoutWallet(null)).toBe(false)
    expect(isPayoutWallet('short')).toBe(false)
    expect(isPayoutWallet(kolA)).toBe(true)
  })

  it('skips KOLs without a wallet and renormalizes remaining shares to 100%', () => {
    const { crew, skipped, heldShare } = skipCrewWithoutPayoutWallets([
      { handle: '@a', wallet: kolA, share: 60, hireRole: 'kol' },
      { handle: '@b', wallet: '', share: 40, hireRole: 'caller' },
    ])
    expect(skipped).toEqual(['@b'])
    expect(heldShare).toBe(40)
    expect(crew).toHaveLength(1)
    expect(crew[0]?.wallet).toBe(kolA)
    expect(crew[0]?.share).toBe(100)
    expect(crew.every((c) => isPayoutWallet(c.wallet))).toBe(true)
  })

  it('does not rewrite shares when every seat already has a wallet', () => {
    const { crew, skipped } = skipCrewWithoutPayoutWallets([
      { handle: '@a', wallet: kolA, share: 60, hireRole: 'kol' },
    ])
    expect(skipped).toEqual([])
    expect(crew[0]?.share).toBe(60)
  })

  it('skips the whole crew when nobody has a payout wallet', () => {
    const { crew, skipped, heldShare } = skipCrewWithoutPayoutWallets([
      { handle: '@new', wallet: '', share: 100, hireRole: 'kol' },
    ])
    expect(crew).toEqual([])
    expect(skipped).toEqual(['@new'])
    expect(heldShare).toBe(100)
  })
})

describe('normalizeShareholderRole', () => {
  it('maps kol display alias to crew for earnings attribution', () => {
    expect(normalizeShareholderRole('kol')).toBe('crew')
    expect(normalizeShareholderRole('crew')).toBe('crew')
    expect(normalizeShareholderRole('agent-referral')).toBe('agent-referral')
    expect(normalizeShareholderRole('buyback')).toBe('platform')
    expect(normalizeShareholderRole('launcher-ops')).toBe('desk')
  })
})

describe('agent referral fee map', () => {
  it('non-referred agent mode sums to 10000 with 60/15/25', () => {
    const crew = normalizeCrew(
      [
        { handle: '@a', wallet: kolA, share: 60, hireRole: 'kol' },
        { handle: '@b', wallet: kolB, share: 40, hireRole: 'caller' },
      ],
      'agent',
    )
    const shares = buildCrewShareholders(crew, 'agent', {
      deskWallet: desk,
      platformWallet: platform,
    })
    expect(shares.reduce((s, r) => s + r.bps, 0)).toBe(10_000)
    expect(shares.find((s) => s.wallet === platform)?.bps).toBe(PLATFORM_BUYBACK_BPS)
    expect(shares.find((s) => s.wallet === desk)?.bps).toBe(1500)
    expect(shares.filter((s) => s.role === 'crew').reduce((s, r) => s + r.bps, 0)).toBe(6000)
    expect(shares.some((s) => s.role === 'agent-referral')).toBe(false)
  })

  it('referred agent mode is 60/15/5/20 and includes referrer on-chain', () => {
    const crew = normalizeCrew(
      [
        { handle: '@a', wallet: kolA, share: 60, hireRole: 'kol' },
        { handle: '@b', wallet: kolB, share: 40, hireRole: 'caller' },
      ],
      'agent',
    )
    const shares = buildCrewShareholders(crew, 'agent', {
      deskWallet: desk,
      platformWallet: platform,
      agentReferrer: { wallet: referrer, handle: '@refkol', code: 'refkol' },
    })
    expect(shares.reduce((s, r) => s + r.bps, 0)).toBe(10_000)
    expect(shares.find((s) => s.wallet === platform)?.bps).toBe(
      PLATFORM_BUYBACK_BPS - AGENT_REFERRAL_BPS,
    )
    expect(shares.find((s) => s.wallet === desk)?.bps).toBe(1500)
    expect(shares.find((s) => s.role === 'agent-referral')?.bps).toBe(AGENT_REFERRAL_BPS)
    expect(shares.find((s) => s.role === 'agent-referral')?.wallet).toBe(referrer)
    expect(shares.filter((s) => s.role === 'crew').reduce((s, r) => s + r.bps, 0)).toBe(6000)
  })

  it('dual-role large seat: keeps crew seat (>= 5% referral floor)', () => {
    const crew = normalizeCrew(
      [{ handle: '@refkol', wallet: referrer, share: 100, hireRole: 'kol' }],
      'agent',
    )
    expect(agentReferrerDualRoleHandles(crew, referrer)).toEqual(['@refkol'])
    const shares = buildCrewShareholders(crew, 'agent', {
      deskWallet: desk,
      platformWallet: platform,
      agentReferrer: { wallet: referrer, handle: '@refkol', code: 'refkol' },
    })
    expect(shares.some((s) => s.role === 'agent-referral')).toBe(false)
    expect(shares.find((s) => s.wallet === referrer)?.role).toBe('crew')
    expect(shares.find((s) => s.wallet === referrer)?.bps).toBe(6000)
    expect(shares.find((s) => s.wallet === platform)?.bps).toBe(PLATFORM_BUYBACK_BPS)
    expect(shares.reduce((s, r) => s + r.bps, 0)).toBe(10_000)
  })

  it('dual-role tiny seat: tops up to 5% referral floor from treasury', () => {
    const crew = normalizeCrew(
      [
        { handle: '@refkol', wallet: referrer, share: 1, hireRole: 'kol' },
        { handle: '@a', wallet: kolA, share: 99, hireRole: 'caller' },
      ],
      'agent',
    )
    const shares = buildCrewShareholders(crew, 'agent', {
      deskWallet: desk,
      platformWallet: platform,
      agentReferrer: { wallet: referrer, handle: '@refkol', code: 'refkol' },
    })
    const ref = shares.find((s) => s.wallet === referrer)
    expect(ref?.bps).toBe(AGENT_REFERRAL_BPS)
    expect(ref?.role).toBe('agent-referral')
    // Floor top-up comes from platform (2500 - (500 - tinySeat)).
    expect(shares.find((s) => s.wallet === platform)?.bps).toBeLessThan(PLATFORM_BUYBACK_BPS)
    expect(shares.reduce((s, r) => s + r.bps, 0)).toBe(10_000)
  })
})

describe('seat caps (Pump 10-wallet)', () => {
  it('maxCrewSeats is 7 referred / 8 unreferred / 8 dual-role', () => {
    expect(maxCrewSeats({ hasAgentReferrer: true })).toBe(MAX_CREW_REFERRED)
    expect(maxCrewSeats({ hasAgentReferrer: false })).toBe(MAX_CREW_UNREFERRED)
    expect(maxCrewSeats({ hasAgentReferrer: true, referrerInCrew: true })).toBe(
      MAX_CREW_UNREFERRED,
    )
  })

  it('referred launch accepts 7 crew (10 wallets)', () => {
    const wallets = freshWallets(7)
    const crew = normalizeCrew(equalCrew(wallets), 'agent', { maxSeats: MAX_CREW_REFERRED })
    const shares = buildCrewShareholders(crew, 'agent', {
      deskWallet: desk,
      platformWallet: platform,
      agentReferrer: { wallet: referrer, handle: '@refkol', code: 'refkol' },
    })
    expect(new Set(shares.map((s) => s.wallet)).size).toBe(10)
    expect(shares.reduce((s, r) => s + r.bps, 0)).toBe(10_000)
  })

  it('referred launch rejects 8 crew', () => {
    const wallets = freshWallets(8)
    expect(() =>
      normalizeCrew(equalCrew(wallets), 'agent', { maxSeats: MAX_CREW_REFERRED }),
    ).toThrow(/1–7/)
    const crew = normalizeCrew(equalCrew(wallets), 'agent', { maxSeats: MAX_CREW_UNREFERRED })
    expect(() =>
      buildCrewShareholders(crew, 'agent', {
        deskWallet: desk,
        platformWallet: platform,
        agentReferrer: { wallet: referrer, handle: '@refkol', code: 'refkol' },
      }),
    ).toThrow(/at most 7/)
  })

  it('unreferred launch accepts 8 crew and rejects 9', () => {
    const eight = freshWallets(8)
    const crew = normalizeCrew(equalCrew(eight), 'agent', { maxSeats: MAX_CREW_UNREFERRED })
    const shares = buildCrewShareholders(crew, 'agent', {
      deskWallet: desk,
      platformWallet: platform,
    })
    expect(new Set(shares.map((s) => s.wallet)).size).toBe(10)
    expect(() =>
      normalizeCrew(equalCrew(freshWallets(9)), 'agent', { maxSeats: MAX_CREW_UNREFERRED }),
    ).toThrow(/1–8/)
  })

  it('Bags platform allows more than Pump’s 10 wallets and still totals 10000', () => {
    const wallets = freshWallets(12)
    const crew = normalizeCrew(equalCrew(wallets), 'agent', { maxSeats: 97 })
    const shares = buildCrewShareholders(crew, 'agent', {
      deskWallet: desk,
      platformWallet: platform,
      platform: 'bags',
    })
    expect(shares.reduce((s, r) => s + r.bps, 0)).toBe(10_000)
    expect(shares.filter((s) => s.role === 'crew').reduce((s, r) => s + r.bps, 0)).toBe(6000)
    expect(shares.find((s) => s.wallet === desk)?.bps).toBe(1500)
    expect(new Set(shares.map((s) => s.wallet)).size).toBeGreaterThan(10)
  })

  it('Zora/EVM fee map is 60/15/25 with checksum wallets', () => {
    const evmDesk = '0x1111111111111111111111111111111111111111'
    const evmTreas = '0x2222222222222222222222222222222222222222'
    const evmKol = '0x3333333333333333333333333333333333333333'
    const crew = normalizeCrew(
      [{ handle: '@z', wallet: evmKol, share: 100, hireRole: 'kol' }],
      'agent',
      { chain: 'evm' },
    )
    const shares = buildCrewShareholders(crew, 'agent', {
      deskWallet: evmDesk,
      platformWallet: evmTreas,
      chain: 'evm',
      platform: 'zora',
    })
    expect(shares.reduce((s, r) => s + r.bps, 0)).toBe(10_000)
    expect(shares.find((s) => s.role === 'crew')?.bps).toBe(6000)
    expect(shares.find((s) => s.wallet === evmDesk)?.bps).toBe(1500)
    expect(shares.find((s) => s.wallet === evmTreas)?.bps).toBe(2500)
  })
})
