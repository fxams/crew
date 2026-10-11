import { describe, expect, it } from 'vitest'
import { AGENT_REFERRAL_BPS, PLATFORM_BUYBACK_BPS } from './constants.js'
import {
  agentReferrerDualRoleHandles,
  buildCrewShareholders,
  normalizeCrew,
} from './shareholders.js'

const platform = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
const desk = 'SysvarRent111111111111111111111111111111111'
const kolA = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const kolB = 'So11111111111111111111111111111111111111112'
const referrer = 'Stake11111111111111111111111111111111111111'

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

  it('logs dual-role when referrer is also in crew (merged bps)', () => {
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
    // Crew 6000 + referral 500 merged onto same wallet.
    expect(shares.find((s) => s.wallet === referrer)?.bps).toBe(6000 + AGENT_REFERRAL_BPS)
    expect(shares.reduce((s, r) => s + r.bps, 0)).toBe(10_000)
  })
})
