import { afterEach, describe, expect, it } from 'vitest'
import {
  bagsClaimersBps,
  parsePumpSwapTiers,
  projectCreatorFees,
  pumpCurveCreatorBps,
  pumpSwapCreatorBps,
  zoraCreatorBps,
  zoraPlatformReferralBps,
} from './fee-rates.js'

describe('fee rate projections', () => {
  afterEach(() => {
    delete process.env.FEE_PUMP_CURVE_BPS
    delete process.env.FEE_PUMPSWAP_TIERS
    delete process.env.FEE_BAGS_CLAIMERS_BPS
    delete process.env.FEE_ZORA_CREATOR_BPS
    delete process.env.FEE_ZORA_PLATFORM_REFERRAL_BPS
  })

  it('defaults Pump curve 0.30% and PumpSwap tiers 0.30 / 0.95 / … / 0.05', () => {
    expect(pumpCurveCreatorBps()).toBe(30)
    expect(pumpSwapCreatorBps(0)).toBe(30)
    expect(pumpSwapCreatorBps(419)).toBe(30)
    expect(pumpSwapCreatorBps(420)).toBe(95)
    expect(pumpSwapCreatorBps(1000)).toBe(95)
    expect(pumpSwapCreatorBps(1470)).toBe(90)
    expect(pumpSwapCreatorBps(98240)).toBe(5)
  })

  it('parses FEE_PUMPSWAP_TIERS overrides', () => {
    process.env.FEE_PUMPSWAP_TIERS = '0:10,100:50'
    const tiers = parsePumpSwapTiers()
    expect(tiers).toEqual([
      { minMcapSol: 0, creatorBps: 10 },
      { minMcapSol: 100, creatorBps: 50 },
    ])
    expect(pumpSwapCreatorBps(99, tiers)).toBe(10)
    expect(pumpSwapCreatorBps(100, tiers)).toBe(50)
  })

  it('projects Bags 1% claimers and notes deployer cut', () => {
    expect(bagsClaimersBps()).toBe(100)
    const p = projectCreatorFees({ platform: 'bags', volumeUsd: 10_000, hasReferrer: false })
    expect(p.creatorFeeUsd).toBe(100)
    expect(p.treasuryShareUsd).toBe(25)
    expect(p.extras[0]?.note).toMatch(/deployer/)
  })

  it('projects Zora 0.50% creator + 0.20% platform referral', () => {
    expect(zoraCreatorBps()).toBe(50)
    expect(zoraPlatformReferralBps()).toBe(20)
    const p = projectCreatorFees({ platform: 'zora', volumeUsd: 10_000, hasReferrer: false })
    expect(p.creatorFeeUsd).toBe(50)
    expect(p.treasuryShareUsd).toBe(12.5)
    expect(p.extras[0]?.usd).toBe(20)
    expect(p.note).toMatch(/0xSplits/)
  })

  it('all rates are env-configurable', () => {
    process.env.FEE_PUMP_CURVE_BPS = '40'
    process.env.FEE_BAGS_CLAIMERS_BPS = '80'
    process.env.FEE_ZORA_CREATOR_BPS = '60'
    process.env.FEE_ZORA_PLATFORM_REFERRAL_BPS = '10'
    expect(pumpCurveCreatorBps()).toBe(40)
    expect(bagsClaimersBps()).toBe(80)
    expect(zoraCreatorBps()).toBe(60)
    expect(zoraPlatformReferralBps()).toBe(10)
  })
})
