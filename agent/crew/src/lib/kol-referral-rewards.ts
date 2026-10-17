/** Keep in sync with agent/crew-api/src/lib/kol-program/referral-rewards.ts */
export const KOL_PROGRAM_REFERRAL_POINTS_REFERRER = 500
export const KOL_PROGRAM_REFERRAL_POINTS_REFERRED = 100

export const KOL_PROGRAM_REFERRAL_MILESTONES = [
  { referrals: 5, bonusPoints: 1000 },
  { referrals: 25, bonusPoints: 5000 },
  { referrals: 100, bonusPoints: 25000 },
] as const

/** Season points floor for next reach tier display (not cash). */
export const KOL_SEASON_TIER_POINTS: Record<string, number> = {
  bronze: 0,
  silver: 10_000,
  gold: 25_000,
  platinum: 50_000,
  spark: 0,
  pulse: 10_000,
  surge: 25_000,
  apex: 50_000,
  legend: 100_000,
}

export function nextSeasonTierKey(tier: string): string | null {
  const order = ['bronze', 'silver', 'gold', 'platinum', 'legend']
  const key = tier.toLowerCase()
  const aliases: Record<string, string> = {
    spark: 'bronze',
    pulse: 'silver',
    surge: 'gold',
    apex: 'platinum',
  }
  const norm = aliases[key] || key
  const idx = order.indexOf(norm)
  if (idx < 0 || idx >= order.length - 1) return null
  return order[idx + 1]
}
