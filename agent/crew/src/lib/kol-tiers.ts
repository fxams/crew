/** Display tier names (influence-style) mapped from reach tiers stored in the API. */
export function kolTierDisplayName(tier: string): string {
  const map: Record<string, string> = {
    bronze: 'Spark',
    silver: 'Pulse',
    gold: 'Surge',
    platinum: 'Apex',
    spark: 'Spark',
    pulse: 'Pulse',
    surge: 'Surge',
    apex: 'Apex',
    legend: 'Legend',
  }
  return map[tier.toLowerCase()] || tier
}

export function kolTierFrameClass(tier: string): string {
  const key = tier.toLowerCase()
  if (['silver', 'pulse'].includes(key)) return 'kol-tier-pulse'
  if (['gold', 'surge'].includes(key)) return 'kol-tier-surge'
  if (['platinum', 'apex'].includes(key)) return 'kol-tier-apex'
  if (key === 'legend') return 'kol-tier-legend'
  return 'kol-tier-spark'
}
