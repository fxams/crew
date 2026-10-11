import { describe, expect, it } from 'vitest'
import { isSelfReferral, agentReferralLink } from './agent-referral.js'

describe('agent referral anti-abuse', () => {
  const ref = 'Stake11111111111111111111111111111111111111'
  const other = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'

  it('rejects self-referral when launcher matches referrer', () => {
    expect(
      isSelfReferral({ referrerWallet: ref, launcherWallet: ref }),
    ).toBe(true)
  })

  it('rejects self-referral when ownerWallet matches referrer', () => {
    expect(
      isSelfReferral({ referrerWallet: ref, ownerWallet: ref, launcherWallet: other }),
    ).toBe(true)
  })

  it('allows distinct launcher/owner', () => {
    expect(
      isSelfReferral({ referrerWallet: ref, ownerWallet: other, launcherWallet: other }),
    ).toBe(false)
  })

  it('builds /r/<code> invite links', () => {
    expect(agentReferralLink('CoolKOL')).toMatch(/\/r\/coolkol$/)
  })
})
