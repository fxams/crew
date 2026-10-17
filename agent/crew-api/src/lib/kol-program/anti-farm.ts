export const MIN_ACCOUNT_AGE_DAYS = 30
export const MIN_FOLLOWERS = 50
export const MAX_REFERRALS_PER_DAY = 25

export type AntiFarmInput = {
  accountAgeDays: number
  followers: number
  referralsToday: number
}

export type AntiFarmResult =
  | { ok: true }
  | { ok: false; reason: string; code: string }

export function checkAntiFarm(input: AntiFarmInput): AntiFarmResult {
  if (input.followers < MIN_FOLLOWERS) {
    return {
      ok: false,
      code: 'min_followers',
      reason: `X account needs at least ${MIN_FOLLOWERS} followers for program credit.`,
    }
  }
  if (input.accountAgeDays < MIN_ACCOUNT_AGE_DAYS) {
    return {
      ok: false,
      code: 'min_account_age',
      reason: `X account must be at least ${MIN_ACCOUNT_AGE_DAYS} days old for program credit.`,
    }
  }
  if (input.referralsToday >= MAX_REFERRALS_PER_DAY) {
    return {
      ok: false,
      code: 'referral_daily_cap',
      reason: `Referral credit is capped at ${MAX_REFERRALS_PER_DAY} per day per referrer.`,
    }
  }
  return { ok: true }
}

export function accountAgeDays(createdAt: Date | string | null | undefined, now = Date.now()): number {
  if (!createdAt) return 0
  const t = createdAt instanceof Date ? createdAt.getTime() : Date.parse(String(createdAt))
  if (!Number.isFinite(t)) return 0
  return Math.max(0, (now - t) / 86_400_000)
}
