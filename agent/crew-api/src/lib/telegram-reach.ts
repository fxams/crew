/**
 * Verified Telegram channel reach as a small Autohire score boost.
 * Never used for fee splits. Unverified / stale channels contribute 0.
 */

/** TG may add at most this fraction of the pre-TG score. */
export const TG_REACH_SCORE_CAP = 0.1

/** log10(members + 1) weight — smaller than X/Pump follower weights. */
export const TG_REACH_LOG_WEIGHT = 2

/** Verified-at older than this is stale and scores 0. */
export const TG_REACH_STALE_MS = 90 * 24 * 60 * 60 * 1000

export type TelegramReachInput = {
  /** Must be true from the posted CREW-XXXX code flow. */
  verified?: boolean | null
  reach?: number | null
  /** ISO / epoch of channel verify. Missing + verified = legacy fresh. */
  verifiedAt?: string | number | Date | null
  nowMs?: number
}

export function isTelegramReachStale(input: TelegramReachInput): boolean {
  if (input.verifiedAt == null || input.verifiedAt === '') return false
  const at =
    typeof input.verifiedAt === 'number'
      ? input.verifiedAt
      : input.verifiedAt instanceof Date
        ? input.verifiedAt.getTime()
        : Date.parse(String(input.verifiedAt))
  if (!Number.isFinite(at)) return false
  const now = input.nowMs ?? Date.now()
  return now - at > TG_REACH_STALE_MS
}

export function telegramReachEligible(input: TelegramReachInput): boolean {
  if (!input.verified) return false
  const reach = Number(input.reach)
  if (!Number.isFinite(reach) || reach <= 0) return false
  if (isTelegramReachStale(input)) return false
  return true
}

/**
 * Log-scaled member boost, capped at ~10% of `baseScore` so it cannot outweigh X.
 * Returns 0 unless the channel was verified via the existing code flow and is fresh.
 */
export function telegramReachBoost(baseScore: number, input: TelegramReachInput): number {
  if (!telegramReachEligible(input)) return 0
  const raw = Math.log10(Number(input.reach) + 1) * TG_REACH_LOG_WEIGHT
  const cap = Math.max(0, baseScore) * TG_REACH_SCORE_CAP
  if (cap <= 0 || raw <= 0) return 0
  return Math.min(raw, cap)
}

export function applyTelegramReachBoost(
  baseScore: number,
  input: TelegramReachInput,
): { score: number; boost: number } {
  const boost = telegramReachBoost(baseScore, input)
  return { score: baseScore + boost, boost }
}
