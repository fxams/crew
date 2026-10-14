/**
 * KOL reputation tiers and crew share weighting (see docs/KOL_REPUTATION.md).
 */

export type KolTier = 'bronze' | 'silver' | 'gold'

export type KolReputationStats = {
  wallet: string
  handle?: string
  completedVerifiedJobs: number
  completedJobs: number
  onTimeJobs: number
  disputesLost: number
  disputesOpened: number
}

const DEFAULT_STATS: KolReputationStats = {
  wallet: '',
  completedVerifiedJobs: 0,
  completedJobs: 0,
  onTimeJobs: 0,
  disputesLost: 0,
  disputesOpened: 0,
}

const statsByWallet = new Map<string, KolReputationStats>()

export function resetKolReputationStore(): void {
  statsByWallet.clear()
}

function key(wallet: string): string {
  return wallet.trim()
}

export function getKolReputationStats(wallet: string): KolReputationStats {
  const w = key(wallet)
  const hit = statsByWallet.get(w)
  if (!hit) return { ...DEFAULT_STATS, wallet: w }
  return { ...hit }
}

export function setKolReputationStats(wallet: string, patch: Partial<KolReputationStats>): KolReputationStats {
  const w = key(wallet)
  const prev = getKolReputationStats(w)
  const next: KolReputationStats = { ...prev, ...patch, wallet: w }
  statsByWallet.set(w, next)
  return next
}

/** On-time delivery rate in [0,1]. */
export function onTimeRate(stats: KolReputationStats): number {
  if (stats.completedJobs <= 0) return 0.5
  return Math.max(0, Math.min(1, stats.onTimeJobs / stats.completedJobs))
}

/**
 * Reputation score in [25, 100] used for crew share weights.
 *
 * score = 25
 *   + 8 * min(completedVerifiedJobs, 10)
 *   + 20 * onTimeRate
 *   - 12 * disputesLost
 *   - 2 * min(disputesOpened, 5)
 */
export function reputationScore(stats: KolReputationStats): number {
  const verified = Math.min(10, Math.max(0, stats.completedVerifiedJobs))
  const onTime = onTimeRate(stats)
  const lost = Math.max(0, stats.disputesLost)
  const opened = Math.min(5, Math.max(0, stats.disputesOpened))
  const raw = 25 + 8 * verified + 20 * onTime - 12 * lost - 2 * opened
  return Math.max(25, Math.min(100, Math.round(raw)))
}

export function tierFromScore(score: number): KolTier {
  if (score >= 75) return 'gold'
  if (score >= 50) return 'silver'
  return 'bronze'
}

export function tierForWallet(wallet: string): { tier: KolTier; score: number; stats: KolReputationStats } {
  const stats = getKolReputationStats(wallet)
  const score = reputationScore(stats)
  return { tier: tierFromScore(score), score, stats }
}

/**
 * Map reputation scores to integer crew pool shares totaling 100.
 * Floor each weight, then distribute remainder to highest scores.
 */
export function reputationWeightedShares(
  members: { wallet: string; score?: number }[],
  totalShare = 100,
): number[] {
  const n = members.length
  if (n <= 0) return []
  if (n === 1) return [totalShare]
  const scores = members.map((m) => Math.max(25, reputationScore(getKolReputationStats(m.wallet))))
  const sum = scores.reduce((a, b) => a + b, 0)
  const raw = scores.map((s) => Math.floor((totalShare * s) / sum))
  let allocated = raw.reduce((a, b) => a + b, 0)
  const order = [...scores.keys()].sort((a, b) => scores[b]! - scores[a]! || a - b)
  let i = 0
  while (allocated < totalShare) {
    raw[order[i % order.length]!] += 1
    allocated += 1
    i += 1
  }
  return raw
}

export function recordVerifiedJobCompletion(opts: {
  wallet: string
  onTime: boolean
  disputeLost?: boolean
}): KolReputationStats {
  const stats = getKolReputationStats(opts.wallet)
  return setKolReputationStats(opts.wallet, {
    completedJobs: stats.completedJobs + 1,
    completedVerifiedJobs: stats.completedVerifiedJobs + 1,
    onTimeJobs: stats.onTimeJobs + (opts.onTime ? 1 : 0),
    disputesLost: stats.disputesLost + (opts.disputeLost ? 1 : 0),
  })
}

export function recordDisputeOpened(wallet: string): KolReputationStats {
  const stats = getKolReputationStats(wallet)
  return setKolReputationStats(wallet, { disputesOpened: stats.disputesOpened + 1 })
}
