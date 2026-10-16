import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deliveryGatedPayoutsEnabled } from './delivery-gated-config.js'
import {
  accrueCrewPayout,
  finalizeUnverifiedRollbacks,
  provisionDeliveryLedgerForLaunch,
  resetDeliveryPayoutLedgers,
  submitPromoDelivery,
} from './delivery-gated-payouts.js'
import { coinPageUrl } from './coin-page.js'
import { memoryJobs } from './jobs/store.js'

function promoUrl(mint: string, ticker = 'CREW') {
  const page = coinPageUrl(mint)
  return `https://x.com/kol/status/${ticker.toLowerCase()}-${page}`
}

describe('delivery-gated crew payouts', () => {
  const env = process.env.CREW_DELIVERY_GATED_PAYOUTS

  beforeEach(() => {
    process.env.CREW_DELIVERY_GATED_PAYOUTS = '1'
    resetDeliveryPayoutLedgers()
    memoryJobs.clearAll()
  })

  afterEach(() => {
    if (env === undefined) delete process.env.CREW_DELIVERY_GATED_PAYOUTS
    else process.env.CREW_DELIVERY_GATED_PAYOUTS = env
  })

  it('is off by default', () => {
    delete process.env.CREW_DELIVERY_GATED_PAYOUTS
    expect(deliveryGatedPayoutsEnabled()).toBe(false)
  })

  it('provisions promo tasks per crew seat when enabled', async () => {
    const ledger = await provisionDeliveryLedgerForLaunch({
      mint: 'Mint1111111111111111111111111111111111111',
      ticker: 'TEST',
      createdBy: 'test',
      crew: [
        {
          handle: '@a',
          wallet: '5WnAczezsDku4YkJEKW9PUzLm87Wuq6VKczLn8n2YHP2',
          share: 50,
        },
        {
          handle: '@b',
          wallet: 'CMxSik1negxei2WxcJwbrZXnb71xQpAdMT1fyshFjWYr',
          share: 50,
        },
      ],
      launchedAt: Date.now() - 60_000,
    })
    expect(ledger?.seats).toHaveLength(2)
    expect(ledger?.seats[0]?.taskJobId).toMatch(/^job_/)
  })

  it('releases accrual only after verified promo', async () => {
    const mint = 'Mint2222222222222222222222222222222222222'
    const wallet = 'GV6UUmNxz2RpKxmNAPadYKb7uQpszwqQAu3qLJxVdC52'
    const launchedAt = Date.now() - 60_000
    await provisionDeliveryLedgerForLaunch({
      mint,
      ticker: 'CREW',
      createdBy: 'test',
      crew: [{ handle: '@kol', wallet, share: 100 }],
      launchedAt,
    })
    accrueCrewPayout(mint, wallet, 0.5)

    const bad = await submitPromoDelivery({
      mint,
      wallet,
      urls: ['https://example.com/not-x'],
    })
    expect(bad.ok).toBe(false)

    const reach = vi.fn(async () => true)
    const good = await submitPromoDelivery({
      mint,
      wallet,
      urls: [promoUrl(mint, 'CREW')],
      text: 'engagement:10',
      reachability: reach,
      submittedAt: launchedAt + 120_000,
    })
    expect(good.ok).toBe(true)
    expect(good.ledger?.seats[0]?.deliveryVerified).toBe(true)
    expect(good.ledger?.seats[0]?.releasableSol).toBeGreaterThan(0)
  })

  it('rolls unverified accrual to verified crew after window', async () => {
    const mint = 'Mint3333333333333333333333333333333333333'
    const verifiedWallet = '6DtEedWf9Wk5hA7Xth82Eq441yf5DA4aGLqaQAVfDokm'
    const lateWallet = 'CMxSik1negxei2WxcJwbrZXnb71xQpAdMT1fyshFjWYr'
    const launchedAt = Date.now() - 80 * 60 * 60_000
    await provisionDeliveryLedgerForLaunch({
      mint,
      ticker: 'ROLL',
      createdBy: 'test',
      crew: [
        { handle: '@ok', wallet: verifiedWallet, share: 50 },
        { handle: '@late', wallet: lateWallet, share: 50 },
      ],
      launchedAt,
    })
    accrueCrewPayout(mint, verifiedWallet, 0.2)
    accrueCrewPayout(mint, lateWallet, 0.3)

    const reach = vi.fn(async () => true)
    await submitPromoDelivery({
      mint,
      wallet: verifiedWallet,
      urls: [promoUrl(mint, 'ROLL')],
      text: 'engagement:5',
      reachability: reach,
      submittedAt: launchedAt + 60_000,
    })

    const rolled = finalizeUnverifiedRollbacks(mint, Date.now())
    expect(rolled?.pooledForfeitSol).toBeGreaterThan(0)
    const verifiedSeat = rolled?.seats.find((s) => s.wallet === verifiedWallet)
    expect(verifiedSeat?.releasableSol).toBeGreaterThan(verifiedSeat?.accruedSol || 0)
  })
})
