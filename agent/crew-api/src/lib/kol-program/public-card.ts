import { query } from '../db.js'
import { siteUrl } from '../kol-register.js'
import {
  accountAgeDays,
  computeReachScore,
  engagementRateFromTotals,
  REACH_FORMULA_DOC,
  reachTier,
  type ReachScoreInput,
} from './reach-score.js'
import { fetchPublicXUserByHandle } from './x-public-user.js'
import { hofBadgesForHandle } from './hall-of-fame.js'

export type ScoreBar = { label: string; value: number }

export type PublicKolCard = {
  handle: string
  claimed: boolean
  unclaimed: boolean
  displayName: string
  avatarUrl: string | null
  reachScore: number
  tier: string
  rank: number | null
  founderNumber: number | null
  referralUrl: string
  cardUrl: string
  profileUrl: string
  scoreBars: ScoreBar[]
  lookupOk: boolean
  xVerified: boolean
  followers: number | null
}

function scoreBarsFromInput(input: ReachScoreInput): ScoreBar[] {
  const caps = REACH_FORMULA_DOC.caps
  const w = REACH_FORMULA_DOC.weights
  const followers = Math.min(100, Math.log10(1 + Math.max(0, input.followers)) * 20)
  const impressions = Math.min(100, Math.log10(1 + Math.max(0, input.avgImpressions)) * 20)
  const engagement = Math.min(
    100,
    Math.min(caps.engagementRate, Math.max(0, input.engagementRate)) * 100,
  )
  const ageYears = Math.min(caps.accountAgeYears, Math.max(0, input.accountAgeDays) / 365)
  const age = ageYears * 10
  const refs = Math.min(caps.referralCount, Math.max(0, input.referralCount)) * 2
  return [
    { label: 'Followers', value: Math.round(w.followers * followers) },
    { label: 'Reach', value: Math.round(w.impressions * impressions) },
    { label: 'Engage', value: Math.round(w.engagement * engagement) },
    { label: 'Tenure', value: Math.round(w.accountAge * age) },
    { label: 'Refs', value: Math.round(w.referrals * refs) },
  ]
}

function blankCard(handle: string): PublicKolCard {
  const h = handle.replace(/^@+/, '')
  const base = siteUrl()
  const referralUrl = `${base}/ref/${encodeURIComponent(h)}`
  return {
    handle: h,
    claimed: false,
    unclaimed: true,
    displayName: h,
    avatarUrl: null,
    reachScore: 0,
    tier: 'bronze',
    rank: null,
    founderNumber: null,
    referralUrl,
    cardUrl: `${base}/api/kol-program/card/${encodeURIComponent(h)}.png`,
    profileUrl: `${base}/kol/${encodeURIComponent(h)}`,
    scoreBars: scoreBarsFromInput({
      followers: 0,
      avgImpressions: 0,
      engagementRate: 0,
      accountAgeDays: 0,
      referralCount: 0,
    }),
    lookupOk: false,
    xVerified: false,
    followers: null,
  }
}

async function seasonRank(handle: string): Promise<number | null> {
  const h = handle.replace(/^@+/, '').toLowerCase()
  const { rows } = await query<{ rank: string }>(
    `SELECT sub.rank::text FROM (
       SELECT p.x_username,
              ROW_NUMBER() OVER (
                PARTITION BY p.season_id
                ORDER BY p.season_points DESC, p.reach_score DESC, p.enrolled_at ASC
              ) AS rank
       FROM kol_program_profiles p
       WHERE p.revoked = false AND p.flagged_reason IS NULL
     ) sub WHERE lower(sub.x_username) = $1`,
    [h],
  )
  const n = Number(rows[0]?.rank)
  return Number.isFinite(n) && n > 0 ? n : null
}

async function loadMemberRow(handle: string) {
  const h = handle.replace(/^@+/, '').toLowerCase()
  const { rows } = await query<Record<string, unknown>>(
    `SELECT p.x_username, p.reach_score, p.reach_tier, p.founder_number,
            p.avg_impressions, p.engagement_rate, p.x_account_created_at,
            r.referral_code, r.x_name, r.profile_image_url, r.followers
     FROM kol_program_profiles p
     JOIN kol_registrations r ON r.x_user_id = p.x_user_id
     WHERE lower(p.x_username) = $1 AND p.revoked = false`,
    [h],
  )
  return rows[0] || null
}

export async function buildPublicKolCard(handle: string): Promise<PublicKolCard> {
  const h = handle.replace(/^@+/, '').trim()
  if (!h) return blankCard('unknown')

  const member = await loadMemberRow(h)
  if (member) {
    const profileHandle = String(member.x_username)
    const rank = await seasonRank(profileHandle)
    const code = String(member.referral_code || profileHandle)
    const base = siteUrl()
    const referralUrl = `${base}/ref/${encodeURIComponent(profileHandle)}`
    const reachInput: ReachScoreInput = {
      followers: Number(member.followers || 0),
      avgImpressions: Number(member.avg_impressions || 0),
      engagementRate: Number(member.engagement_rate || 0),
      accountAgeDays: accountAgeDays(
        member.x_account_created_at ? String(member.x_account_created_at) : null,
      ),
      referralCount: 0,
    }
    return {
      handle: profileHandle,
      claimed: true,
      unclaimed: false,
      displayName: String(member.x_name || profileHandle),
      avatarUrl: member.profile_image_url ? String(member.profile_image_url) : null,
      reachScore: Number(member.reach_score),
      tier: String(member.reach_tier),
      rank,
      founderNumber: member.founder_number != null ? Number(member.founder_number) : null,
      referralUrl,
      cardUrl: `${base}/api/kol-program/card/${encodeURIComponent(profileHandle)}.png`,
      profileUrl: `${base}/kol/${encodeURIComponent(profileHandle)}`,
      scoreBars: scoreBarsFromInput(reachInput),
      lookupOk: true,
      xVerified: false,
      followers: Number(member.followers || 0),
    }
  }

  const xUser = await fetchPublicXUserByHandle(h)
  if (!xUser) {
    return blankCard(h)
  }

  const ageDays = accountAgeDays(xUser.createdAt)
  const reachInput: ReachScoreInput = {
    followers: xUser.followers,
    avgImpressions: Math.max(100, xUser.followers * 2),
    engagementRate: engagementRateFromTotals({
      impressions: Math.max(1, xUser.followers * 3),
      likes: 0,
      replies: 0,
      retweets: 0,
    }),
    accountAgeDays: ageDays,
    referralCount: 0,
  }
  const reachScore = computeReachScore(reachInput)
  const tier = reachTier(reachScore)
  const base = siteUrl()
  const referralUrl = `${base}/ref/${encodeURIComponent(xUser.username)}`

  return {
    handle: xUser.username,
    claimed: false,
    unclaimed: true,
    displayName: xUser.name,
    avatarUrl: xUser.profileImageUrl,
    reachScore,
    tier,
    rank: null,
    founderNumber: null,
    referralUrl,
    cardUrl: `${base}/api/kol-program/card/${encodeURIComponent(xUser.username)}.png`,
    profileUrl: `${base}/kol/${encodeURIComponent(xUser.username)}`,
    scoreBars: scoreBarsFromInput(reachInput),
    lookupOk: true,
    xVerified: xUser.verified,
    followers: xUser.followers,
  }
}

export async function cardInputForHandle(handle: string) {
  const card = await buildPublicKolCard(handle)
  const badges = card.claimed ? await hofBadgesForHandle(card.handle) : []
  return { card, badges }
}
