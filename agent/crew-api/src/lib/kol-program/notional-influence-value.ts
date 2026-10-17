import type { ReachScoreInput } from './reach-score.js'

/** Shown on cards and /kol — not fee-share or season pool copy. */
export const NOTIONAL_VALUE_DISCLAIMER =
  'Notional, based on public X metrics. Not earnings or a payout.'

/**
 * Transparent display-only USD estimate from public X metrics (followers, impressions, engagement).
 * Log-scaled so large accounts land in a plausible card range; not used for payouts.
 */
export const NOTIONAL_VALUE_FORMULA_DOC = {
  disclaimer: NOTIONAL_VALUE_DISCLAIMER,
  inputs: ['followers', 'avgImpressionsPerPost', 'engagementRate'],
  steps: [
    'audience = log10(1 + followers) × 120 + log10(1 + avgImpressionsPerPost) × 90',
    'boost = 1 + min(engagementRate, 0.25) × 3',
    'notionalUsd = round(audience × boost × 2.75)',
  ],
  constants: {
    followerLogWeight: 120,
    impressionsLogWeight: 90,
    engagementCap: 0.25,
    engagementMultiplier: 3,
    scale: 2.75,
  },
} as const

function log10p(n: number): number {
  return Math.log10(1 + Math.max(0, n))
}

export function computeNotionalInfluenceValueUsd(input: ReachScoreInput): number {
  const audience =
    log10p(input.followers) * NOTIONAL_VALUE_FORMULA_DOC.constants.followerLogWeight +
    log10p(input.avgImpressions) * NOTIONAL_VALUE_FORMULA_DOC.constants.impressionsLogWeight
  const er = Math.min(
    NOTIONAL_VALUE_FORMULA_DOC.constants.engagementCap,
    Math.max(0, input.engagementRate),
  )
  const boost = 1 + er * NOTIONAL_VALUE_FORMULA_DOC.constants.engagementMultiplier
  const raw = audience * boost * NOTIONAL_VALUE_FORMULA_DOC.constants.scale
  return Math.max(0, Math.round(raw))
}

export function formatNotionalUsd(n: number): string {
  return `$${Math.max(0, Math.round(n)).toLocaleString('en-US')}`
}
