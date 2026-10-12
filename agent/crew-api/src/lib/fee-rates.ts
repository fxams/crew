/**
 * Configurable creator-fee rates for kickoff *budget projections* only.
 * Does not change on-chain fee-share configs or payout addresses.
 *
 * Sources (defaults):
 * - Pump.fun bonding curve creator 0.30%
 * - PumpSwap canonical creator tiers by SOL mcap (0.30% <420, 0.95% 420–1470, stepping to 0.05%)
 * - Bags.fm 1% claimers pool (protocol may also take a separate ~25% deployer cut)
 * - Zora creator 0.50% + 0.20% platform referral
 */

import { platformBuybackBps } from './agent/constants.js'

export type FeePlatform = 'pumpfun' | 'bags' | 'zora'

export type PumpSwapTier = {
  minMcapSol: number
  creatorBps: number
}

/** Official Pump.fun PumpSwap creator-fee ladder (SOL mcap), as of pump.fun/docs/fees. */
export const DEFAULT_PUMPSWAP_TIERS: PumpSwapTier[] = [
  { minMcapSol: 0, creatorBps: 30 },
  { minMcapSol: 420, creatorBps: 95 },
  { minMcapSol: 1470, creatorBps: 90 },
  { minMcapSol: 2460, creatorBps: 85 },
  { minMcapSol: 3440, creatorBps: 80 },
  { minMcapSol: 4420, creatorBps: 75 },
  { minMcapSol: 9820, creatorBps: 70 },
  { minMcapSol: 14740, creatorBps: 65 },
  { minMcapSol: 19650, creatorBps: 60 },
  { minMcapSol: 24560, creatorBps: 55 },
  { minMcapSol: 29470, creatorBps: 50 },
  { minMcapSol: 34380, creatorBps: 45 },
  { minMcapSol: 39300, creatorBps: 40 },
  { minMcapSol: 44210, creatorBps: 35 },
  { minMcapSol: 49120, creatorBps: 30 },
  { minMcapSol: 54030, creatorBps: 27.5 },
  { minMcapSol: 58940, creatorBps: 25 },
  { minMcapSol: 63860, creatorBps: 22.5 },
  { minMcapSol: 68770, creatorBps: 20 },
  { minMcapSol: 73681, creatorBps: 17.5 },
  { minMcapSol: 78590, creatorBps: 15 },
  { minMcapSol: 83500, creatorBps: 12.5 },
  { minMcapSol: 88400, creatorBps: 10 },
  { minMcapSol: 93330, creatorBps: 8 },
  { minMcapSol: 98240, creatorBps: 5 },
]

function numEnv(name: string, fallback: number): number {
  const n = Number(process.env[name])
  if (!Number.isFinite(n) || n < 0) return fallback
  return n
}

export function pumpCurveCreatorBps(): number {
  return numEnv('FEE_PUMP_CURVE_BPS', 30)
}

export function bagsClaimersBps(): number {
  return numEnv('FEE_BAGS_CLAIMERS_BPS', 100)
}

/** Bags protocol deployer cut of the *gross* claimers pool. Not part of CrewPay's 10,000-bps map. */
export function bagsDeployerCutBps(): number {
  return numEnv('FEE_BAGS_DEPLOYER_CUT_BPS', 2500)
}

export function zoraCreatorBps(): number {
  return numEnv('FEE_ZORA_CREATOR_BPS', 50)
}

export function zoraPlatformReferralBps(): number {
  return numEnv('FEE_ZORA_PLATFORM_REFERRAL_BPS', 20)
}

export function parsePumpSwapTiers(raw?: string | null): PumpSwapTier[] {
  const s = (raw ?? process.env.FEE_PUMPSWAP_TIERS ?? '').trim()
  if (!s) return DEFAULT_PUMPSWAP_TIERS
  const rows: PumpSwapTier[] = []
  for (const part of s.split(',')) {
    const [min, bps] = part.split(':').map((x) => Number(String(x).trim()))
    if (!Number.isFinite(min) || min < 0 || !Number.isFinite(bps) || bps < 0) continue
    rows.push({ minMcapSol: min, creatorBps: bps })
  }
  if (!rows.length) return DEFAULT_PUMPSWAP_TIERS
  return rows.sort((a, b) => a.minMcapSol - b.minMcapSol)
}

export function pumpSwapCreatorBps(mcapSol: number, tiers = parsePumpSwapTiers()): number {
  const m = Math.max(0, Number(mcapSol) || 0)
  let bps = tiers[0]?.creatorBps ?? 30
  for (const t of tiers) {
    if (m + 1e-12 >= t.minMcapSol) bps = t.creatorBps
  }
  return bps
}

export type FeeProjection = {
  platform: FeePlatform
  volumeUsd: number
  creatorRateBps: number
  creatorFeeUsd: number
  treasuryBps: number
  treasuryShareUsd: number
  extras: Array<{ label: string; bps: number; usd: number; note: string }>
  note: string
}

export function projectCreatorFees(opts: {
  platform: FeePlatform
  volumeUsd: number
  mcapSol?: number | null
  graduated?: boolean
  hasReferrer?: boolean
}): FeeProjection {
  const volumeUsd = Math.max(0, Number(opts.volumeUsd) || 0)
  const treasuryBps = platformBuybackBps(Boolean(opts.hasReferrer))
  const extras: FeeProjection['extras'] = []
  let creatorRateBps = 0
  let note = ''

  if (opts.platform === 'bags') {
    creatorRateBps = bagsClaimersBps()
    const deployer = bagsDeployerCutBps()
    extras.push({
      label: 'Bags deployer cut (protocol)',
      bps: deployer,
      usd: (volumeUsd * creatorRateBps * deployer) / 10_000 / 10_000,
      note: 'Possible ~25% Bags deployer take of the gross claimers pool. Not in CrewPay’s 60/15/25 map. Override FEE_BAGS_DEPLOYER_CUT_BPS.',
    })
    note =
      'Bags claimers pool (default 1% of volume, FEE_BAGS_CLAIMERS_BPS) is split 60/15/25. Bags may also take a separate deployer cut (~25%).'
  } else if (opts.platform === 'zora') {
    creatorRateBps = zoraCreatorBps()
    const refBps = zoraPlatformReferralBps()
    extras.push({
      label: 'Zora platform referral',
      bps: refBps,
      usd: (volumeUsd * refBps) / 10_000,
      note: 'Paid to ZORA_PLATFORM_REFERRER (defaults to treasury address today — not the 0xSplits). Override FEE_ZORA_PLATFORM_REFERRAL_BPS.',
    })
    note =
      'Zora creator rewards (default 0.50%) go to the 0xSplits 60/15/25. Platform referral (default 0.20%) is a separate protocol share.'
  } else if (opts.graduated) {
    creatorRateBps = pumpSwapCreatorBps(Number(opts.mcapSol) || 0)
    note = `PumpSwap canonical creator fee at ${Number(opts.mcapSol) || 0} SOL mcap (FEE_PUMPSWAP_TIERS).`
  } else {
    creatorRateBps = pumpCurveCreatorBps()
    note = 'Pump.fun bonding-curve creator fee (default 0.30%, FEE_PUMP_CURVE_BPS).'
  }

  const creatorFeeUsd = (volumeUsd * creatorRateBps) / 10_000
  const treasuryShareUsd = (creatorFeeUsd * treasuryBps) / 10_000
  return {
    platform: opts.platform,
    volumeUsd,
    creatorRateBps,
    creatorFeeUsd: Number(creatorFeeUsd.toFixed(6)),
    treasuryBps,
    treasuryShareUsd: Number(treasuryShareUsd.toFixed(6)),
    extras,
    note,
  }
}

export function feeRatesPublic() {
  return {
    pumpfun: {
      curveCreatorBps: pumpCurveCreatorBps(),
      pumpswapTiers: parsePumpSwapTiers(),
    },
    bags: {
      claimersBps: bagsClaimersBps(),
      deployerCutBps: bagsDeployerCutBps(),
      deployerNote:
        'Bags may take a separate ~25% deployer cut of the gross claimers pool. Not part of CrewPay’s 10,000-bps map.',
    },
    zora: {
      creatorBps: zoraCreatorBps(),
      platformReferralBps: zoraPlatformReferralBps(),
      referralNote:
        'Platform referral is paid to ZORA_PLATFORM_REFERRER. To send it through the 60/15/25 0xSplits, a future launch would pass the predicted split as platformReferrer — CrewPay does not change on-chain addresses here.',
    },
  }
}
