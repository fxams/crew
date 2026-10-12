import { describe, expect, it, beforeEach } from 'vitest'
import {
  computeKickoffBudget,
  decideKickoff,
  evaluateTraction,
  fundedAtProgress,
  kickoffCatalog,
  listKickoffAudit,
  maybeProposeEligible,
  proposeKickoff,
  reservedUsdFor,
  resetKickoff,
  spentSolFor,
  kickoffPublicView,
} from './kickoff.js'
import { platformBuybackBps } from './agent/constants.js'
import { resetFxCache } from './fx.js'

const MINT = 'So11111111111111111111111111111111111111112'

describe('kickoff budget ledger', () => {
  beforeEach(() => {
    resetKickoff()
    resetFxCache()
    delete process.env.KICKOFF_MIN_FEES_SOL
    delete process.env.KICKOFF_MIN_VOLUME_USD
    delete process.env.KICKOFF_MIN_HOLDERS
    delete process.env.KICKOFF_DEXSCREENER_MIN_VOLUME_USD
    delete process.env.KICKOFF_DEXSCREENER_MIN_MCAP_SOL
    delete process.env.AI_CREW_MAX_PER_DAY
    delete process.env.CREW_X_HANDLE
    delete process.env.KICKOFF_COST_DEXSCREENER_USD
    delete process.env.KICKOFF_COST_CUSTOM_DOMAIN_USD
    delete process.env.KICKOFF_COST_DEXTOOLS_USD
    delete process.env.KICKOFF_COST_X_ACCOUNT_USD
    delete process.env.CREW_KICKOFF_AUTO_USD
    delete process.env.CREW_SOL_USD
    delete process.env.CREW_ETH_USD
  })

  it('uses 25% treasury without referrer and 20% with referrer', () => {
    process.env.CREW_SOL_USD = '100'
    const fees = 10
    const a = computeKickoffBudget({ accruedSol: fees, hasReferrer: false, reservedUsd: 0, spentUsd: 0 })
    const b = computeKickoffBudget({ accruedSol: fees, hasReferrer: true, reservedUsd: 0, spentUsd: 0 })
    expect(a.treasuryBps).toBe(2500)
    expect(b.treasuryBps).toBe(2000)
    expect(a.capSol).toBe(2.5)
    expect(b.capSol).toBe(2)
    expect(a.capUsd).toBe(250)
    expect(b.capUsd).toBe(200)
    expect(a.capSol).toBe((fees * platformBuybackBps(false)) / 10_000)
    expect(JSON.stringify(a).toLowerCase()).not.toMatch(/launcher gets 60/)
  })

  it('defaults Dexscreener $299, hosted website free, custom domain ~$10', () => {
    process.env.CREW_SOL_USD = '100'
    const items = kickoffCatalog({ mint: MINT })
    expect(items.find((i) => i.id === 'website')).toMatchObject({
      included: true,
      costUsd: 0,
    })
    expect(items.find((i) => i.id === 'website')?.summary).toMatch(/crewpay\.dev\/coin\//)
    const ds = items.find((i) => i.id === 'dexscreener')
    expect(ds?.costUsd).toBe(299)
    expect(ds?.priceMayChange).toBe(true)
    expect(ds?.costNote).toMatch(/may change/i)
    expect(items.find((i) => i.id === 'custom-domain')?.costUsd).toBe(10)
    expect(items.find((i) => i.id === 'ai-crew')?.included).toBe(true)
    expect(items.find((i) => i.id === 'crew-post')?.summary).toMatch(/shared @crewpay/)
    expect(items.map((i) => i.id)).toEqual([
      'website',
      'ai-crew',
      'crew-post',
      'custom-domain',
      'dexscreener',
    ])
  })

  it('item is eligible only when treasury budget covers the full USD cost', () => {
    process.env.KICKOFF_MIN_FEES_SOL = '0'
    process.env.CREW_SOL_USD = '100'
    // 1 SOL accrued * 25% = 0.25 SOL = $25 — covers $10 domain, not $299 Dexscreener
    const view = kickoffPublicView({
      mint: MINT,
      accruedSol: 1,
      hasReferrer: false,
      solUsd: 100,
    })
    expect(view.budget.capUsd).toBe(25)
    const domain = view.extras.find((e) => e.id === 'custom-domain')
    const ds = view.extras.find((e) => e.id === 'dexscreener')
    expect(domain?.fundedAt.fullyFunded).toBe(true)
    expect(domain?.eligible).toBe(true)
    expect(domain?.fundedAt.label).toMatch(/\$25 \/ \$10/)
    expect(ds?.fundedAt.fullyFunded).toBe(false)
    expect(ds?.eligible).toBe(false)
    expect(ds?.state).toBe('waiting-traction')
    expect(ds?.fundedAt.progress).toBeCloseTo(25 / 299)
    expect(view.nextItem?.id).toBe('custom-domain')
    expect(view.nextItem?.fundedAt.fullyFunded).toBe(true)
    expect(view.freeTier.dedicatedXAccount).toBe(false)
    expect(view.freeTier.aiMemesPerDay).toBe(3)
  })

  it('reserves on approval so a second item cannot double-spend', () => {
    process.env.KICKOFF_MIN_FEES_SOL = '0'
    process.env.CREW_SOL_USD = '100'
    process.env.KICKOFF_COST_DEXTOOLS_USD = '8'
    // $25 budget; $10 domain + $8 dextools each fit alone
    const traction = evaluateTraction({ feesGeneratedSol: 1 })
    const budget = computeKickoffBudget({
      accruedSol: 1,
      hasReferrer: false,
      reservedUsd: 0,
      spentUsd: 0,
      solUsd: 100,
    })
    expect(budget.availableUsd).toBe(25)
    const a = proposeKickoff({ mint: MINT, itemId: 'custom-domain', budget, traction })
    const b = proposeKickoff({ mint: MINT, itemId: 'dextools', budget, traction })
    expect(a.status).toBe('pending')
    expect(b.status).toBe('pending')
    expect(reservedUsdFor(MINT)).toBe(0)

    const first = decideKickoff(a.id, 'approved', 'AdminWallet111', { availableUsd: 25 })
    expect(first.transfer).toBeNull()
    expect(first.automaticSpend).toBe(false)
    expect(reservedUsdFor(MINT)).toBe(10)
    expect(spentSolFor(MINT)).toBeCloseTo(0.1)

    expect(() => decideKickoff(b.id, 'approved', 'AdminWallet111', { availableUsd: 15 })).not.toThrow()
    expect(reservedUsdFor(MINT)).toBe(18)

    const tight = kickoffPublicView({ mint: `${MINT}x`, accruedSol: 1, hasReferrer: false, solUsd: 100 })
    const d1 = proposeKickoff({
      mint: `${MINT}x`,
      itemId: 'custom-domain',
      budget: tight.budget,
      traction,
    })
    const d2 = proposeKickoff({
      mint: `${MINT}x`,
      itemId: 'dextools',
      budget: tight.budget,
      traction,
    })
    decideKickoff(d1.id, 'approved', 'Admin', { availableUsd: 12 })
    expect(() => decideKickoff(d2.id, 'approved', 'Admin', { availableUsd: 2 })).toThrow(/double-spend/)
  })

  it('blocks extras until traction thresholds are met', () => {
    process.env.KICKOFF_MIN_FEES_SOL = '1'
    process.env.KICKOFF_MIN_HOLDERS = '50'
    process.env.CREW_SOL_USD = '100'
    const cold = evaluateTraction({ feesGeneratedSol: 0.1, holders: 3 })
    expect(cold.met).toBe(false)
    const hot = evaluateTraction({ feesGeneratedSol: 2, holders: 80, volumeUsd: 0 })
    expect(hot.met).toBe(true)
    const budget = computeKickoffBudget({
      accruedSol: 20,
      hasReferrer: true,
      reservedUsd: 0,
      spentUsd: 0,
      solUsd: 100,
    })
    expect(budget.treasuryBps).toBe(2000)
    expect(() =>
      proposeKickoff({ mint: MINT, itemId: 'custom-domain', budget, traction: cold }),
    ).toThrow(/Traction gate/)
  })

  it('queues cheapest extras that fit in full and never auto-spends', () => {
    process.env.KICKOFF_MIN_FEES_SOL = '0'
    process.env.CREW_SOL_USD = '100'
    process.env.KICKOFF_COST_DEXTOOLS_USD = '8'
    const traction = evaluateTraction({ feesGeneratedSol: 1 })
    const budget = computeKickoffBudget({
      accruedSol: 1,
      hasReferrer: false,
      reservedUsd: 0,
      spentUsd: 0,
      solUsd: 100,
    })
    expect(budget.capUsd).toBe(25)
    const queued = maybeProposeEligible({ mint: MINT, budget, traction })
    expect(queued.map((q) => q.itemId)).toEqual(['dextools', 'custom-domain'])
    expect(queued.every((q) => q.status === 'pending')).toBe(true)
    const view = kickoffPublicView({ mint: MINT, accruedSol: 1, hasReferrer: false, solUsd: 100 })
    expect(view.feeMap).toMatch(/60% KOL crew/)
    expect(view.note).toMatch(/never auto-transfers treasury/i)
    expect(view.extras.find((e) => e.id === 'dexscreener')?.eligible).toBe(false)
  })

  it('auto-approves at or under CREW_KICKOFF_AUTO_USD when fully covered; above waits', () => {
    process.env.KICKOFF_MIN_FEES_SOL = '0'
    process.env.CREW_KICKOFF_AUTO_USD = '20'
    process.env.CREW_SOL_USD = '100'
    const traction = evaluateTraction({ feesGeneratedSol: 50 })
    const budget = computeKickoffBudget({
      accruedSol: 50,
      hasReferrer: false,
      reservedUsd: 0,
      spentUsd: 0,
      solUsd: 100,
    })
    expect(budget.capUsd).toBe(1250)
    const small = proposeKickoff({ mint: MINT, itemId: 'custom-domain', budget, traction })
    expect(small.status).toBe('approved')
    expect(small.autoApproved).toBe(true)
    expect(small.payoutStatus).toBe('queued')
    expect(small.costUsd).toBe(10)
    expect(reservedUsdFor(MINT)).toBe(10)

    const rest = computeKickoffBudget({
      accruedSol: 50,
      hasReferrer: false,
      reservedUsd: reservedUsdFor(MINT),
      spentUsd: 0,
      solUsd: 100,
    })
    const big = proposeKickoff({
      mint: MINT,
      itemId: 'dexscreener',
      budget: rest,
      traction,
      dexscreener: {
        met: true,
        volumeUsd: 100_000,
        marketCapSol: 1200,
        minVolumeUsd: 100_000,
        minMcapSol: 1000,
        reasons: [],
      },
    })
    expect(big.status).toBe('pending')
    expect(big.autoApproved).toBeFalsy()
    expect(big.payoutStatus).toBe('none')
    expect(big.note).toMatch(/\$299 > \$20 auto cap/)
    expect(listKickoffAudit(MINT).map((e) => e.action)).toEqual([
      'proposed',
      'auto-approved',
      'proposed',
    ])
  })

  it('does not auto-approve when CREW_KICKOFF_AUTO_USD is 0 or USD price is unknown', () => {
    process.env.KICKOFF_MIN_FEES_SOL = '0'
    delete process.env.CREW_KICKOFF_AUTO_USD
    process.env.CREW_SOL_USD = '100'
    const traction = evaluateTraction({ feesGeneratedSol: 10 })
    const budget = computeKickoffBudget({
      accruedSol: 10,
      hasReferrer: false,
      reservedUsd: 0,
      spentUsd: 0,
      solUsd: 100,
    })
    const off = proposeKickoff({ mint: `${MINT}a`, itemId: 'custom-domain', budget, traction })
    expect(off.status).toBe('pending')

    process.env.CREW_KICKOFF_AUTO_USD = '50'
    const unknown = computeKickoffBudget({
      accruedSol: 10,
      hasReferrer: false,
      reservedUsd: 0,
      spentUsd: 0,
      solUsd: null,
    })
    expect(unknown.availableUsd).toBeNull()
    expect(() =>
      proposeKickoff({ mint: `${MINT}b`, itemId: 'custom-domain', budget: unknown, traction }),
    ).toThrow(/USD budget unknown/)
  })

  it('unlocks Dexscreener only at ~$100K volume or 1000 SOL mcap AND full funding', () => {
    process.env.KICKOFF_MIN_FEES_SOL = '0'
    process.env.CREW_SOL_USD = '100'
    const funded = kickoffPublicView({
      mint: MINT,
      accruedSol: 20,
      hasReferrer: false,
      solUsd: 100,
      volumeUsd: 100_000,
    })
    expect(funded.budget.capUsd).toBe(500)
    expect(funded.dexscreener.met).toBe(true)
    expect(funded.extras.find((e) => e.id === 'dexscreener')?.eligible).toBe(true)

    const mcap = kickoffPublicView({
      mint: `${MINT}m`,
      accruedSol: 20,
      hasReferrer: false,
      solUsd: 100,
      volumeUsd: 10,
      marketCapUsd: 1000 * 100,
    })
    expect(mcap.dexscreener.met).toBe(true)

    const cold = kickoffPublicView({
      mint: `${MINT}c`,
      accruedSol: 20,
      hasReferrer: false,
      solUsd: 100,
      volumeUsd: 50,
    })
    expect(cold.dexscreener.met).toBe(false)
    expect(cold.extras.find((e) => e.id === 'dexscreener')?.state).toBe('waiting-traction')
  })

  it('precomputes funded-at progress', () => {
    expect(fundedAtProgress(299, 25).label).toBe('$25 / $299 (8%)')
    expect(fundedAtProgress(299, 25).fullyFunded).toBe(false)
    expect(fundedAtProgress(10, 25).fullyFunded).toBe(true)
    expect(fundedAtProgress(0, 25).label).toBe('included')
  })
})
