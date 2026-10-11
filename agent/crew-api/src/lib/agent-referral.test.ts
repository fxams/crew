import { describe, expect, it } from 'vitest'
import { isSelfReferral } from './agent-referral.js'

const refWallet = 'Stake11111111111111111111111111111111111111'
const other = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'

describe('isSelfReferral', () => {
  it('blocks matching owner or launcher wallet', () => {
    expect(
      isSelfReferral({
        referrerWallet: refWallet,
        ownerWallet: refWallet,
      }),
    ).toBe(true)
    expect(
      isSelfReferral({
        referrerWallet: refWallet,
        launcherWallet: refWallet,
      }),
    ).toBe(true)
    expect(
      isSelfReferral({
        referrerWallet: refWallet,
        ownerWallet: other,
        launcherWallet: other,
      }),
    ).toBe(false)
  })

  it('blocks matching X username or agent label', () => {
    expect(
      isSelfReferral({
        referrerWallet: refWallet,
        referrerXUsername: 'coolkol',
        ownerXUsername: 'CoolKOL',
      }),
    ).toBe(true)
    expect(
      isSelfReferral({
        referrerWallet: refWallet,
        referrerXUsername: 'coolkol',
        agentLabel: 'bot:coolkol:gpt',
      }),
    ).toBe(true)
    expect(
      isSelfReferral({
        referrerWallet: refWallet,
        referrerXUsername: 'coolkol',
        agentLabel: 'other-agent',
        ownerXUsername: 'someoneelse',
      }),
    ).toBe(false)
  })
})
