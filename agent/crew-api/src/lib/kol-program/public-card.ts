import { query } from '../db.js'
import { siteUrl } from '../kol-register.js'
import { accountAgeDays } from './anti-farm.js'
import {
  computeReachScore,
  REACH_FORMULA_DOC,
  reachTier,
  type ReachScoreInput,
} from './reach-score.js'
import { fetchPublicXUserByHandle } from './x-public-user.js'
import { hofBadgesForHandle } from './hall-of-fame.js'
import { computeNotionalInfluenceValueUsd } from './notional-influence-value.js'

export type ScoreBar = {
  label: string
  /** 0–100. Null when the signal is not available (do not show a fake 0). */
  value: number | null
  hint?: string
}

export const SCORE_BAR_UNAVAILABLE_HINT = 'Dashes mean that signal is not on public X yet — not a zero score.'

export type PublicKolCard = {
  handle: string
  claimed: boolean
  unclaimed: boolean
  displayName: string
  avatarUrl: string | null
  reachScore: number
  /** Display-only USD from public X metrics — not earnings. */
  notionalInfluenceValueUsd: number
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
  seasonPoints: number
  memberNumber: number | null
}

function logScale100(n: number): number {
  return Math.min(100, Math.log10(1 + Math.max(0, n)) * 20)
}

export function scoreBarsFromInput(
  input: ReachScoreInput,
  opts?: { engagementKnown?: boolean; networkKnown?: boolean; lookupOk?: boolean },
): ScoreBar[] {
  const lookupOk = opts?.lookupOk !== false
  const engagementKnown = lookupOk && opts?.engagementKnown !== false
  const networkKnown = lookupOk && opts?.networkKnown !== false
  const caps = REACH_FORMULA_DOC.caps
  const engagement = Math.min(
    100,
    (Math.min(caps.engagementRate, Math.max(0, input.engagementRate)) / caps.engagementRate) *
      100,
  )
  const reach = logScale100(input.avgImpressions)
  const followers = logScale100(input.followers)
  const content = engagement
  const network = Math.min(
    100,
    (Math.min(caps.referralCount, Math.max(0, input.referralCount)) / caps.referralCount) * 100,
  )
  const ageYears = Math.min(caps.accountAgeYears, Math.max(0, input.accountAgeDays) / 365)
  const accountAge = Math.round((ageYears / caps.accountAgeYears) * 100)
  return [
    {
      label: 'Engagement',
      value: engagementKnown ? Math.round(engagement) : null,
      hint: engagementKnown ? undefined : 'Needs recent public posts',
    },
    { label: 'Reach', value: lookupOk ? Math.round(reach) : null },
    { label: 'Followers', value: lookupOk ? Math.round(followers) : null },
    {
      label: 'Content quality',
      value: engagementKnown ? Math.round(content) : null,
      hint: engagementKnown ? undefined : 'Needs recent public posts',
    },
    {
      label: 'Network',
      value: networkKnown ? Math.round(network) : null,
      hint: networkKnown ? undefined : 'After you claim',
    },
    { label: 'Account age', value: lookupOk ? Math.round(accountAge) : null },
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
    notionalInfluenceValueUsd: 0,
    tier: 'bronze',
    rank: null,
    founderNumber: null,
    referralUrl,
    cardUrl: `${base}/api/kol-program/card/${encodeURIComponent(h)}.png`,
    profileUrl: `${base}/kol/${encodeURIComponent(h)}`,
    scoreBars: scoreBarsFromInput(
      {
        followers: 0,
        avgImpressions: 0,
        engagementRate: 0,
        accountAgeDays: 0,
        referralCount: 0,
      },
      { lookupOk: false, engagementKnown: false, networkKnown: false },
    ),
    lookupOk: false,
    xVerified: false,
    followers: null,
    seasonPoints: 0,
    memberNumber: null,
  }
}

async function memberNumberFor(xUserId: string): Promise<number | null> {
  const { rows } = await query<{ n: string }>(
    `SELECT sub.n::text FROM (
       SELECT x_user_id,
              ROW_NUMBER() OVER (ORDER BY enrolled_at ASC) AS n
       FROM kol_program_profiles
       WHERE revoked = false
     ) sub
     WHERE sub.x_user_id = $1`,
    [xUserId],
  )
  const n = Number(rows[0]?.n)
  return Number.isFinite(n) && n > 0 ? n : null
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
    `SELECT p.x_user_id, p.x_username, p.reach_score, p.reach_tier, p.founder_number,
            p.season_points, p.avg_impressions, p.engagement_rate, p.x_account_created_at,
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
    const refCount = await query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM kol_referral_events
       WHERE lower(referrer_code) = lower($1) AND event_type = 'register'`,
      [code],
    )
    const engagementKnown = member.engagement_rate != null && member.engagement_rate !== ''
    const reachInput: ReachScoreInput = {
      followers: Number(member.followers || 0),
      avgImpressions: Number(member.avg_impressions || 0),
      engagementRate: engagementKnown ? Number(member.engagement_rate) : 0,
      accountAgeDays: accountAgeDays(
        member.x_account_created_at ? String(member.x_account_created_at) : null,
      ),
      referralCount: Number(refCount.rows[0]?.n || 0),
    }
    const memberNo = await memberNumberFor(String(member.x_user_id))
    return {
      handle: profileHandle,
      claimed: true,
      unclaimed: false,
      displayName: String(member.x_name || profileHandle),
      avatarUrl: member.profile_image_url ? String(member.profile_image_url) : null,
      reachScore: Number(member.reach_score),
      notionalInfluenceValueUsd: computeNotionalInfluenceValueUsd(reachInput),
      tier: String(member.reach_tier),
      rank,
      founderNumber: member.founder_number != null ? Number(member.founder_number) : null,
      referralUrl,
      cardUrl: `${base}/api/kol-program/card/${encodeURIComponent(profileHandle)}.png`,
      profileUrl: `${base}/kol/${encodeURIComponent(profileHandle)}`,
      scoreBars: scoreBarsFromInput(reachInput, { engagementKnown, networkKnown: true }),
      lookupOk: true,
      xVerified: false,
      followers: Number(member.followers || 0),
      seasonPoints: Number(member.season_points || 0),
      memberNumber: memberNo,
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
    // Public user lookup has followers/age, not recent-post engagement or referrals.
    engagementRate: 0,
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
    notionalInfluenceValueUsd: computeNotionalInfluenceValueUsd(reachInput),
    tier,
    rank: null,
    founderNumber: null,
    referralUrl,
    cardUrl: `${base}/api/kol-program/card/${encodeURIComponent(xUser.username)}.png`,
    profileUrl: `${base}/kol/${encodeURIComponent(xUser.username)}`,
    scoreBars: scoreBarsFromInput(reachInput, { engagementKnown: false, networkKnown: false }),
    lookupOk: true,
    xVerified: xUser.verified,
    followers: xUser.followers,
    seasonPoints: 0,
    memberNumber: null,
  }
}

export async function cardInputForHandle(handle: string) {
  const card = await buildPublicKolCard(handle)
  const badges = card.claimed ? await hofBadgesForHandle(card.handle) : []
  return { card, badges }
}
