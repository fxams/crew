/**
 * Reach score (0–100) for KOL program cards / leaderboard.
 * Published on crewpay.dev/register when KOL_PROGRAM_ENABLED.
 *
 * Components (weights sum to 1):
 * - Followers (log scale): 30%
 * - Avg impressions per post (log scale): 25%
 * - Engagement rate (likes+replies+retweets / impressions, capped): 20%
 * - Account age (days, capped at 3y): 15%
 * - Direct referrals credited in-program: 10%
 */
export type ReachScoreInput = {
  followers: number
  avgImpressions: number
  engagementRate: number
  accountAgeDays: number
  referralCount: number
}

export type ReachTier = 'bronze' | 'silver' | 'gold' | 'platinum'

export const REACH_FORMULA_DOC = {
  weights: {
    followers: 0.3,
    impressions: 0.25,
    engagement: 0.2,
    accountAge: 0.15,
    referrals: 0.1,
  },
  caps: {
    accountAgeYears: 3,
    referralCount: 50,
    engagementRate: 0.25,
  },
  tiers: {
    bronze: [0, 39],
    silver: [40, 59],
    gold: [60, 79],
    platinum: [80, 100],
  },
} as const

function log10p(n: number): number {
  return Math.log10(1 + Math.max(0, n))
}

export function computeReachScore(input: ReachScoreInput): number {
  const followers = log10p(input.followers) * 20
  const impressions = log10p(input.avgImpressions) * 20
  const engagement = Math.min(REACH_FORMULA_DOC.caps.engagementRate, Math.max(0, input.engagementRate)) * 100
  const ageYears = Math.min(
    REACH_FORMULA_DOC.caps.accountAgeYears,
    Math.max(0, input.accountAgeDays) / 365,
  )
  const age = ageYears * 10
  const refs = Math.min(REACH_FORMULA_DOC.caps.referralCount, Math.max(0, input.referralCount)) * 2
  const raw =
    REACH_FORMULA_DOC.weights.followers * followers +
    REACH_FORMULA_DOC.weights.impressions * impressions +
    REACH_FORMULA_DOC.weights.engagement * engagement +
    REACH_FORMULA_DOC.weights.accountAge * age +
    REACH_FORMULA_DOC.weights.referrals * refs
  return Math.max(0, Math.min(100, Math.round(raw)))
}

export function reachTier(score: number): ReachTier {
  if (score >= 80) return 'platinum'
  if (score >= 60) return 'gold'
  if (score >= 40) return 'silver'
  return 'bronze'
}

export function engagementRateFromTotals(totals: {
  impressions: number
  likes: number
  replies: number
  retweets: number
}): number {
  const imp = Math.max(1, totals.impressions)
  return (totals.likes + totals.replies + totals.retweets) / imp
}
