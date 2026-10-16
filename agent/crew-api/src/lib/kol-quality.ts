/**
 * Anti-fake-engagement signals for Autohire ranking (no live X API required).
 */

export type KolQualityInput = {
  handle: string
  followers: number
  /** Account age in days when known (registered KOLs). */
  accountAgeDays?: number | null
  tweetCount?: number | null
  following?: number | null
  /** Optional engagement hints from registration refresh. */
  avgLikesPerPost?: number | null
  /** Pump directory rank (lower is better). */
  dbRank?: number
}

export type KolQualityAssessment = {
  qualityScore: number
  engagementToFollowerRatio: number
  flags: string[]
  /** Drop from autohire pools when true. */
  excluded: boolean
  autohirePenalty: number
}

const MIN_ACCOUNT_AGE_DAYS = 30
const MIN_ENGAGEMENT_RATIO = 0.00005
const MAX_ENGAGEMENT_RATIO = 0.08
const SPIKE_FOLLOWERS_THRESHOLD = 50_000
const SPIKE_RANK_GAP = 500

function safeRatio(num: number, den: number): number {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return 0
  return num / den
}

/** Heuristic reply-farm detector from handle + follower band. */
function suspiciousReplyHeuristic(input: KolQualityInput): boolean {
  const h = input.handle.replace(/^@+/, '').toLowerCase()
  if (/^(user|account)\d{3,}$/i.test(h)) return true
  if (input.followers > 80_000 && input.tweetCount != null && input.tweetCount < 50) return true
  if (input.following != null && input.followers > 0) {
    const ratio = input.following / input.followers
    if (input.followers > 20_000 && ratio > 0.9) return true
  }
  return false
}

function followerSpike(input: KolQualityInput): boolean {
  if (input.followers < SPIKE_FOLLOWERS_THRESHOLD) return false
  if (input.dbRank == null || input.dbRank <= 0) return false
  return input.dbRank > SPIKE_RANK_GAP && input.followers > 100_000
}

export function assessKolQuality(input: KolQualityInput): KolQualityAssessment {
  const flags: string[] = []
  let penalty = 0

  const tweets = Math.max(1, Number(input.tweetCount || 0) || 1)
  const likes = Number(input.avgLikesPerPost ?? 0)
  let engagementToFollowerRatio = safeRatio(likes, input.followers)
  if (engagementToFollowerRatio <= 0 && input.followers > 0) {
    // Fallback: tweet volume vs followers when likes unknown.
    engagementToFollowerRatio = safeRatio(tweets, input.followers)
  }

  if (engagementToFollowerRatio < MIN_ENGAGEMENT_RATIO && input.followers > 5_000) {
    flags.push('low engagement vs followers')
    penalty += 18
  }
  if (engagementToFollowerRatio > MAX_ENGAGEMENT_RATIO && input.followers > 10_000) {
    flags.push('engagement ratio unusually high')
    penalty += 12
  }

  const age = input.accountAgeDays
  if (age != null && age < MIN_ACCOUNT_AGE_DAYS && input.followers > 25_000) {
    flags.push('young account + high followers')
    penalty += 22
  }

  if (followerSpike(input)) {
    flags.push('follower spike vs directory rank')
    penalty += 20
  }

  if (suspiciousReplyHeuristic(input)) {
    flags.push('suspicious reply / bot heuristics')
    penalty += 28
  }

  const excluded = penalty >= 40 || flags.length >= 3
  const qualityScore = Math.max(0, 100 - penalty)

  return {
    qualityScore,
    engagementToFollowerRatio,
    flags,
    excluded,
    autohirePenalty: penalty,
  }
}
