import { describe, expect, it } from 'vitest'
import {
  isSelfReferral,
  namesMatchSelfReferral,
  normalizeReferralName,
} from './agent-referral.js'
import { normalizeShareholderRole } from './agent/shareholders.js'

const refWallet = 'Stake11111111111111111111111111111111111111'
const other = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'

describe('normalizeReferralName / namesMatchSelfReferral', () => {
  it('strips case and non-alphanumerics', () => {
    expect(normalizeReferralName('@CrewPayHQ')).toBe('crewpayhq')
    expect(normalizeReferralName('crewpayhq-bot')).toBe('crewpayhqbot')
  })

  it('blocks prefix/suffix variants of the referrer handle', () => {
    expect(namesMatchSelfReferral('crewpayhq', 'crewpayhq-bot')).toBe(true)
    expect(namesMatchSelfReferral('crewpayhq', 'bot_crewpayhq')).toBe(true)
    expect(namesMatchSelfReferral('crewpayhq', 'CrewPayHQ')).toBe(true)
    expect(namesMatchSelfReferral('crewpayhq', 'totallydifferent')).toBe(false)
  })
})

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

  it('blocks fuzzy X / label matches including crewpayhq-bot', () => {
    expect(
      isSelfReferral({
        referrerWallet: refWallet,
        referrerXUsername: 'crewpayhq',
        ownerXUsername: 'CrewPayHQ',
      }),
    ).toBe(true)
    expect(
      isSelfReferral({
        referrerWallet: refWallet,
        referrerXUsername: 'crewpayhq',
        agentLabel: 'crewpayhq-bot:gpt',
      }),
    ).toBe(true)
    expect(
      isSelfReferral({
        referrerWallet: refWallet,
        referrerXUsername: 'crewpayhq',
        agentLabel: 'other-agent',
        ownerXUsername: 'someoneelse',
      }),
    ).toBe(false)
  })
})

describe('crew earnings role normalize', () => {
  it('kol alias is treated as crew for remit attribution', () => {
    expect(normalizeShareholderRole('kol')).toBe('crew')
  })
})
