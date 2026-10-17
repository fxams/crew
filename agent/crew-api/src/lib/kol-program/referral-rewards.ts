import { query } from '../db.js'
import { creditProgramPoints } from './store.js'

/** Season points when someone joins via your /ref link (KOL program). */
export const KOL_PROGRAM_REFERRAL_POINTS_REFERRER = 500
/** Season points for the new member who used a referral link. */
export const KOL_PROGRAM_REFERRAL_POINTS_REFERRED = 100

export const KOL_PROGRAM_REFERRAL_MILESTONES = [
  { referrals: 5, bonusPoints: 1000 },
  { referrals: 25, bonusPoints: 5000 },
  { referrals: 100, bonusPoints: 25000 },
] as const

async function referrerXUserIdForCode(code: string): Promise<string | null> {
  const { rows } = await query<{ x_user_id: string }>(
    `SELECT x_user_id FROM kol_registrations WHERE lower(referral_code) = lower($1) LIMIT 1`,
    [code.trim()],
  )
  return rows[0]?.x_user_id || null
}

/** One-time milestone bonuses when referral counts cross 5 / 25 / 100. */
export async function maybeAwardReferralMilestones(referrerXUserId: string): Promise<void> {
  const { rows: reg } = await query<{ referral_code: string }>(
    `SELECT referral_code FROM kol_registrations WHERE x_user_id = $1`,
    [referrerXUserId],
  )
  const code = reg[0]?.referral_code
  if (!code) return

  const { rows: countRows } = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM kol_referral_events
     WHERE lower(referrer_code) = lower($1) AND event_type = 'register'`,
    [code],
  )
  const count = Number(countRows[0]?.n || 0)

  for (const m of KOL_PROGRAM_REFERRAL_MILESTONES) {
    if (count < m.referrals) continue
    const kind = `referral_milestone:${m.referrals}`
    const { rows: existing } = await query<{ id: string }>(
      `SELECT id FROM kol_program_point_events
       WHERE x_user_id = $1 AND kind = $2 LIMIT 1`,
      [referrerXUserId, kind],
    )
    if (existing[0]) continue
    await creditProgramPoints(referrerXUserId, m.bonusPoints, kind)
  }
}

/** Award KOL program season points for a new referred registration. */
export async function awardKolProgramReferralSeasonPoints(opts: {
  referrerCode: string
  referredXUserId: string
}): Promise<void> {
  const referrerId = await referrerXUserIdForCode(opts.referrerCode)
  if (!referrerId || referrerId === opts.referredXUserId) return

  await creditProgramPoints(
    referrerId,
    KOL_PROGRAM_REFERRAL_POINTS_REFERRER,
    'referral:register',
    opts.referredXUserId,
  )
  await creditProgramPoints(
    opts.referredXUserId,
    KOL_PROGRAM_REFERRAL_POINTS_REFERRED,
    'referral:joined',
    referrerId,
  )
  await maybeAwardReferralMilestones(referrerId)
}
