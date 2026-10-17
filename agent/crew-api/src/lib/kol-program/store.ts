import { randomBytes } from 'node:crypto'
import { query } from '../db.js'
import { KOL_PROGRAM_FOUNDER_CAP, kolProgramEnabled } from './flags.js'
import {
  accountAgeDays,
  checkAntiFarm,
  MAX_REFERRALS_PER_DAY,
  MIN_ACCOUNT_AGE_DAYS,
  MIN_FOLLOWERS,
} from './anti-farm.js'
import {
  computeReachScore,
  engagementRateFromTotals,
  reachTier,
  type ReachScoreInput,
} from './reach-score.js'
import { renderKolCardSvg } from './card-svg.js'
import { siteUrl } from '../kol-register.js'
import { hofBadgesForHandle, persistHallOfFame } from './hall-of-fame.js'
import type { HofBadge } from './hall-of-fame.js'

export type ProgramProfile = {
  xUserId: string
  handle: string
  reachScore: number
  tier: string
  founderNumber: number | null
  seasonPoints: number
  totalPoints: number
  flaggedReason: string | null
  revoked: boolean
  referralCode: string
  referralUrl: string
  hallOfFame: HofBadge[]
}

function id(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`
}

export async function storeUserAccessToken(
  xUserId: string,
  accessToken: string,
  ttlSec = 7200,
): Promise<void> {
  if (!kolProgramEnabled()) return
  const expires = new Date(Date.now() + ttlSec * 1000)
  await query(
    `INSERT INTO kol_program_user_tokens (x_user_id, access_token, expires_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (x_user_id) DO UPDATE SET access_token = EXCLUDED.access_token, expires_at = EXCLUDED.expires_at`,
    [xUserId, accessToken, expires],
  )
}

export async function loadUserAccessToken(xUserId: string): Promise<string | null> {
  const { rows } = await query<{ access_token: string; expires_at: Date }>(
    `SELECT access_token, expires_at FROM kol_program_user_tokens WHERE x_user_id = $1`,
    [xUserId],
  )
  const row = rows[0]
  if (!row || row.expires_at.getTime() < Date.now()) return null
  return row.access_token
}

export async function enrollAfterRegistration(opts: {
  xUserId: string
  handle: string
  followers: number
  following: number
  tweetCount: number
  accountCreatedAt: string | null
  referralCount: number
  avgImpressions?: number
  engagementRate?: number
}): Promise<void> {
  if (!kolProgramEnabled()) return
  const xUserId = opts.xUserId.trim()
  if (!xUserId) return

  const ageDays = accountAgeDays(opts.accountCreatedAt)
  const reachInput: ReachScoreInput = {
    followers: opts.followers,
    avgImpressions: opts.avgImpressions ?? Math.max(100, opts.followers * 2),
    engagementRate: opts.engagementRate ?? 0.02,
    accountAgeDays: ageDays,
    referralCount: opts.referralCount,
  }
  const reachScore = computeReachScore(reachInput)
  const tier = reachTier(reachScore)

  const founder = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM kol_program_profiles WHERE founder_number IS NOT NULL`,
  )
  const founderCount = Number(founder.rows[0]?.n || 0)
  let founderNumber: number | null = null
  const existing = await query<{ founder_number: number | null }>(
    `SELECT founder_number FROM kol_program_profiles WHERE x_user_id = $1`,
    [xUserId],
  )
  if (existing.rows[0]?.founder_number) {
    founderNumber = Number(existing.rows[0].founder_number)
  } else if (founderCount < KOL_PROGRAM_FOUNDER_CAP) {
    founderNumber = founderCount + 1
  }

  const season = await getCurrentSeasonId()
  const farm = checkAntiFarm({
    accountAgeDays: ageDays,
    followers: opts.followers,
    referralsToday: 0,
  })
  const flaggedReason = farm.ok ? null : farm.reason

  await query(
    `INSERT INTO kol_program_profiles (
       x_user_id, x_username, reach_score, reach_tier, founder_number,
       season_id, season_points, total_points, flagged_reason, revoked,
       x_account_created_at, avg_impressions, engagement_rate, enrolled_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,0,0,$7,false,$8,$9,$10,now(),now())
     ON CONFLICT (x_user_id) DO UPDATE SET
       x_username = EXCLUDED.x_username,
       reach_score = EXCLUDED.reach_score,
       reach_tier = EXCLUDED.reach_tier,
       founder_number = COALESCE(kol_program_profiles.founder_number, EXCLUDED.founder_number),
       flagged_reason = EXCLUDED.flagged_reason,
       x_account_created_at = COALESCE(kol_program_profiles.x_account_created_at, EXCLUDED.x_account_created_at),
       avg_impressions = EXCLUDED.avg_impressions,
       engagement_rate = EXCLUDED.engagement_rate,
       updated_at = now()`,
    [
      xUserId,
      opts.handle.replace(/^@+/, ''),
      reachScore,
      tier,
      founderNumber,
      season,
      flaggedReason,
      opts.accountCreatedAt,
      reachInput.avgImpressions,
      reachInput.engagementRate,
    ],
  )
}

export async function getCurrentSeasonId(): Promise<string> {
  const month = new Date().toISOString().slice(0, 7)
  const sid = `season_${month}`
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM kol_program_seasons WHERE archived_at IS NULL ORDER BY starts_at DESC LIMIT 1`,
  )
  const active = rows[0]?.id
  if (active === sid) return sid

  if (active && active !== sid) {
    const top = await query<Record<string, unknown>>(
      `SELECT x_username, season_points, reach_score, reach_tier, founder_number
       FROM kol_program_profiles
       WHERE season_id = $1 AND revoked = false AND flagged_reason IS NULL
       ORDER BY season_points DESC, reach_score DESC, enrolled_at ASC
       LIMIT 100`,
      [active],
    )
    const archiveRows: Array<{ rank: number; handle: string; seasonPoints: number }> = []
    for (let i = 0; i < top.rows.length; i++) {
      const r = top.rows[i]
      const rank = i + 1
      archiveRows.push({
        rank,
        handle: String(r.x_username),
        seasonPoints: Number(r.season_points),
      })
      await query(
        `INSERT INTO kol_program_season_archive (
           season_id, rank, handle, season_points, reach_score, reach_tier, founder_number
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (season_id, rank) DO NOTHING`,
        [
          active,
          rank,
          String(r.x_username),
          Number(r.season_points),
          Number(r.reach_score),
          String(r.reach_tier),
          r.founder_number != null ? Number(r.founder_number) : null,
        ],
      )
    }
    await persistHallOfFame(active, archiveRows)
    await query(
      `UPDATE kol_program_seasons SET ends_at = now(), archived_at = now() WHERE id = $1`,
      [active],
    )
    await query(`UPDATE kol_program_profiles SET season_points = 0, season_id = $1`, [sid])
  }

  await query(
    `INSERT INTO kol_program_seasons (id, name, starts_at) VALUES ($1, $2, date_trunc('month', now() AT TIME ZONE 'UTC'))
     ON CONFLICT (id) DO NOTHING`,
    [sid, `Season ${month}`],
  )
  return sid
}

export async function listSeasons(): Promise<
  Array<{
    id: string
    name: string
    startsAt: string
    endsAt: string | null
    archivedAt: string | null
    current: boolean
  }>
> {
  const current = await getCurrentSeasonId()
  const { rows } = await query<Record<string, unknown>>(
    `SELECT id, name, starts_at, ends_at, archived_at FROM kol_program_seasons ORDER BY starts_at DESC LIMIT 24`,
  )
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    startsAt: new Date(String(r.starts_at)).toISOString(),
    endsAt: r.ends_at ? new Date(String(r.ends_at)).toISOString() : null,
    archivedAt: r.archived_at ? new Date(String(r.archived_at)).toISOString() : null,
    current: String(r.id) === current,
  }))
}

export async function seasonArchiveLeaderboard(seasonId: string, limit = 50): Promise<
  Array<{
    rank: number
    handle: string
    seasonPoints: number
    reachScore: number
    tier: string
    founderNumber: number | null
  }>
> {
  const { rows } = await query<Record<string, unknown>>(
    `SELECT rank, handle, season_points, reach_score, reach_tier, founder_number
     FROM kol_program_season_archive WHERE season_id = $1 ORDER BY rank ASC LIMIT $2`,
    [seasonId, limit],
  )
  return rows.map((r) => ({
    rank: Number(r.rank),
    handle: String(r.handle),
    seasonPoints: Number(r.season_points),
    reachScore: Number(r.reach_score),
    tier: String(r.reach_tier),
    founderNumber: r.founder_number != null ? Number(r.founder_number) : null,
  }))
}

export async function getProgramProfileByHandle(handle: string): Promise<ProgramProfile | null> {
  const h = handle.replace(/^@+/, '').toLowerCase()
  const { rows } = await query<Record<string, unknown>>(
    `SELECT p.*, r.referral_code
     FROM kol_program_profiles p
     JOIN kol_registrations r ON r.x_user_id = p.x_user_id
     WHERE lower(p.x_username) = $1 AND p.revoked = false`,
    [h],
  )
  const r = rows[0]
  if (!r) return null
  const code = String(r.referral_code || h)
  const profileHandle = String(r.x_username)
  const hallOfFame = await hofBadgesForHandle(profileHandle)
  return {
    xUserId: String(r.x_user_id),
    handle: profileHandle,
    reachScore: Number(r.reach_score),
    tier: String(r.reach_tier),
    founderNumber: r.founder_number != null ? Number(r.founder_number) : null,
    seasonPoints: Number(r.season_points),
    totalPoints: Number(r.total_points),
    flaggedReason: r.flagged_reason ? String(r.flagged_reason) : null,
    revoked: Boolean(r.revoked),
    referralCode: code,
    referralUrl: `${siteUrl()}/ref/${encodeURIComponent(profileHandle)}`,
    hallOfFame,
  }
}

export async function leaderboard(limit = 50): Promise<
  Array<{
    rank: number
    handle: string
    seasonPoints: number
    reachScore: number
    tier: string
    founderNumber: number | null
  }>
> {
  const season = await getCurrentSeasonId()
  const { rows } = await query<Record<string, unknown>>(
    `SELECT x_username, season_points, reach_score, reach_tier, founder_number
     FROM kol_program_profiles
     WHERE season_id = $1 AND revoked = false AND flagged_reason IS NULL
     ORDER BY season_points DESC, reach_score DESC, enrolled_at ASC
     LIMIT $2`,
    [season, limit],
  )
  return rows.map((r, i) => ({
    rank: i + 1,
    handle: String(r.x_username),
    seasonPoints: Number(r.season_points),
    reachScore: Number(r.reach_score),
    tier: String(r.reach_tier),
    founderNumber: r.founder_number != null ? Number(r.founder_number) : null,
  }))
}

export async function cardSvgForHandle(handle: string): Promise<string | null> {
  const profile = await getProgramProfileByHandle(handle)
  if (!profile) return null
  const { rows } = await query<{ x_name: string; profile_image_url: string | null }>(
    `SELECT x_name, profile_image_url FROM kol_registrations WHERE x_user_id = $1`,
    [profile.xUserId],
  )
  const row = rows[0]
  const badges = await hofBadgesForHandle(profile.handle)
  return renderKolCardSvg({
    handle: profile.handle,
    displayName: row?.x_name || profile.handle,
    avatarUrl: row?.profile_image_url || null,
    reachScore: profile.reachScore,
    tier: profile.tier,
    founderNumber: profile.founderNumber,
    referralUrl: profile.referralUrl,
    hallOfFameBadges: badges,
  })
}

export async function creditProgramPoints(
  xUserId: string,
  points: number,
  kind: string,
  refId?: string,
): Promise<void> {
  if (points <= 0) return
  const season = await getCurrentSeasonId()
  await query(
    `INSERT INTO kol_program_point_events (id, x_user_id, season_id, kind, points, ref_id)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [id('kpp'), xUserId, season, kind, points, refId || null],
  )
  await query(
    `UPDATE kol_program_profiles
     SET season_points = season_points + $2, total_points = total_points + $2, updated_at = now()
     WHERE x_user_id = $1`,
    [xUserId, points],
  )
}

export async function referralsTodayForCode(code: string): Promise<number> {
  const { rows } = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM kol_referral_events
     WHERE event_type = 'register' AND lower(referrer_code) = $1
       AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')`,
    [code.toLowerCase()],
  )
  return Number(rows[0]?.n || 0)
}

export { MIN_ACCOUNT_AGE_DAYS, MIN_FOLLOWERS, MAX_REFERRALS_PER_DAY, engagementRateFromTotals }
