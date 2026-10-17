export const KOL_PROGRAM_POINTS_DISCLAIMER =
  "Points themselves have no cash value. The season pool shares 20% of the treasury's actual creator-fee income among the top 50 KOLs; amounts vary, depend on real fees, and aren't guaranteed."

export const KOL_PROGRAM_POOL_SHARE_LABEL =
  'Estimated share if the season ended now (not guaranteed)'

/** API may return REACH_FORMULA_DOC as JSON; never render objects as React children. */
export function formatReachFormulaDoc(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return null
    }
  }
  return null
}

const API = (
  (import.meta.env.VITE_CREW_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'https://api.crewpay.dev'
)

export type KolProgramProfile = {
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
  rank?: number | null
  referralCount?: number
}

export type KolHubRecentJoiner = {
  handle: string
  enrolledAt: string
  founderNumber: number | null
}

export type KolProgramHub = {
  seasonId: string
  seasonEndsAt: string | null
  memberCount: number
  recentJoiners: KolHubRecentJoiner[]
  referralMilestones: Array<{ referrals: number; bonusPoints: number }>
  disclaimer: string
}

export type KolProgramTask = {
  id: string
  slug: string
  title: string
  instructions: string
  points: number
  completed: boolean
}

export type KolLeaderboardRow = {
  rank: number
  handle: string
  seasonPoints: number
  reachScore: number
  tier: string
  founderNumber: number | null
}

export type HofBadge = {
  seasonId: string
  seasonNumber: number
  rank: number
  label: string
}

export type HallOfFameEntry = {
  seasonId: string
  seasonNumber: number
  rank: number
  handle: string
  seasonPoints: number
}

export type KolPoolStatus = {
  seasonId: string
  poolBps: number
  receipts: { solana: { sol: number }; base: { eth: number } }
  poolSlice: { solana: { sol: number }; base: { eth: number } }
  copy: string
  disclaimer: string
}

export type KolProgramSeason = {
  id: string
  name: string
  startsAt: string
  endsAt: string | null
  archivedAt: string | null
  current: boolean
}

export async function fetchKolProgramHub(): Promise<KolProgramHub | null> {
  try {
    const res = await fetch(`${API}/api/kol-program/hub`)
    if (!res.ok) return null
    const body = (await res.json()) as KolProgramHub & { ok?: boolean }
    return {
      seasonId: body.seasonId,
      seasonEndsAt: body.seasonEndsAt ?? null,
      memberCount: Math.max(0, Number(body.memberCount) || 0),
      recentJoiners: Array.isArray(body.recentJoiners) ? body.recentJoiners : [],
      referralMilestones: Array.isArray(body.referralMilestones) ? body.referralMilestones : [],
      disclaimer: body.disclaimer || KOL_PROGRAM_POINTS_DISCLAIMER,
    }
  } catch {
    return null
  }
}

export async function fetchKolProgramStatus(): Promise<{
  enabled: boolean
  reachFormula?: string
  pointsDisclaimer?: string
  referralFeeMap?: string
}> {
  try {
    const res = await fetch(`${API}/api/kol-program/status`)
    if (!res.ok) return { enabled: false }
    const body = (await res.json()) as {
      enabled?: boolean
      reachFormula?: string
      pointsDisclaimer?: string
      referralFeeMap?: string
    }
    return {
      enabled: Boolean(body.enabled),
      reachFormula: formatReachFormulaDoc(body.reachFormula) ?? undefined,
      pointsDisclaimer: body.pointsDisclaimer,
      referralFeeMap: body.referralFeeMap,
    }
  } catch {
    return { enabled: false }
  }
}

export async function fetchKolProgramMe(): Promise<KolProgramProfile | null> {
  const res = await fetch(`${API}/api/kol-program/me`, { credentials: 'include' })
  if (!res.ok) return null
  const body = (await res.json()) as { profile?: KolProgramProfile }
  return body.profile ?? null
}

export async function fetchKolProgramTasksToday(): Promise<{
  dayUtc: string
  tasks: KolProgramTask[]
  disclaimer: string
} | null> {
  const res = await fetch(`${API}/api/kol-program/tasks/today`, { credentials: 'include' })
  if (!res.ok) return null
  return (await res.json()) as {
    dayUtc: string
    tasks: KolProgramTask[]
    disclaimer: string
  }
}

export async function verifyKolProgramTask(taskId: string): Promise<{
  ok: boolean
  error?: string
  points?: number
  flagged?: boolean
}> {
  const res = await fetch(`${API}/api/kol-program/tasks/${encodeURIComponent(taskId)}/verify`, {
    method: 'POST',
    credentials: 'include',
  })
  const body = (await res.json()) as {
    ok?: boolean
    error?: string
    points?: number
    flagged?: boolean
  }
  if (!res.ok) {
    return { ok: false, error: body.error || 'Verify failed.', flagged: body.flagged }
  }
  return { ok: true, points: body.points }
}

export async function fetchKolProgramLeaderboard(limit = 50): Promise<{
  seasonId: string
  rows: KolLeaderboardRow[]
  disclaimer: string
  crewPriorityCopy?: string
  pool?: KolPoolStatus | null
  poolError?: string
} | null> {
  const res = await fetch(`${API}/api/kol-program/leaderboard?limit=${limit}`)
  if (!res.ok) return null
  return (await res.json()) as {
    seasonId: string
    rows: KolLeaderboardRow[]
    disclaimer: string
    crewPriorityCopy?: string
    pool?: KolPoolStatus | null
    poolError?: string
  }
}

export async function fetchKolProgramSeasons(seasonId?: string): Promise<{
  seasons: KolProgramSeason[]
  archive: KolLeaderboardRow[] | null
  archiveSeasonId: string | null
  hallOfFame: HallOfFameEntry[] | null
} | null> {
  const q = seasonId ? `?seasonId=${encodeURIComponent(seasonId)}` : ''
  const res = await fetch(`${API}/api/kol-program/seasons${q}`)
  if (!res.ok) return null
  return (await res.json()) as {
    seasons: KolProgramSeason[]
    archive: KolLeaderboardRow[] | null
    archiveSeasonId: string | null
    hallOfFame: HallOfFameEntry[] | null
  }
}

export async function fetchHallOfFameAll(): Promise<
  Array<{ seasonId: string; seasonNumber: number; name: string; top: HallOfFameEntry[] }>
> {
  const res = await fetch(`${API}/api/kol-program/hall-of-fame`)
  if (!res.ok) return []
  const body = (await res.json()) as {
    seasons?: Array<{ seasonId: string; seasonNumber: number; name: string; top: HallOfFameEntry[] }>
  }
  return body.seasons || []
}

export async function fetchKolProgramProfile(handle: string): Promise<{
  hallOfFame: HofBadge[]
} | null> {
  const res = await fetch(`${API}/api/kol-program/profile/${encodeURIComponent(handle)}`)
  if (!res.ok) return null
  const body = (await res.json()) as { profile?: { hallOfFame?: HofBadge[] } }
  return body.profile ? { hallOfFame: body.profile.hallOfFame || [] } : null
}

export function hofBadgeLabel(seasonNumber: number): string {
  return `Season ${seasonNumber} top KOL`
}

export function kolProgramCardUrl(handle: string, ext: 'svg' | 'png' = 'png'): string {
  const h = handle.replace(/^@+/, '')
  return `${API}/api/kol-program/card/${encodeURIComponent(h)}.${ext}`
}

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
  scoreBars: Array<{ label: string; value: number }>
  lookupOk: boolean
  xVerified: boolean
  followers: number | null
}

export async function fetchPublicKolCard(handle: string): Promise<{
  card: PublicKolCard
  pinnedPostId: string | null
  disclaimer: string
} | null> {
  const h = handle.replace(/^@+/, '').trim()
  if (!h) return null
  const res = await fetch(`${API}/api/kol-program/public/${encodeURIComponent(h)}`)
  if (!res.ok) return null
  const body = (await res.json()) as {
    card?: PublicKolCard
    pinnedPostId?: string | null
    disclaimer?: string
  }
  if (!body.card) return null
  return {
    card: body.card,
    pinnedPostId: body.pinnedPostId ?? null,
    disclaimer: body.disclaimer || KOL_PROGRAM_POINTS_DISCLAIMER,
  }
}

export type OnboardingStep = {
  id: string
  title: string
  points: number
  order: number
  optional?: boolean
  completed: boolean
  unlocked: boolean
}

export async function fetchKolOnboarding(): Promise<{
  steps: OnboardingStep[]
  nextStep: string | null
  referralUrl: string
  pinnedPostId: string | null
} | null> {
  const res = await fetch(`${API}/api/kol-program/onboarding`, { credentials: 'include' })
  if (!res.ok) return null
  return (await res.json()) as {
    steps: OnboardingStep[]
    nextStep: string | null
    referralUrl: string
    pinnedPostId: string | null
  }
}

export async function verifyKolOnboardingStep(stepId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${API}/api/kol-program/onboarding/${encodeURIComponent(stepId)}/verify`, {
    method: 'POST',
    credentials: 'include',
  })
  const body = (await res.json()) as { ok?: boolean; error?: string }
  if (!res.ok) return { ok: false, error: body.error || 'Verify failed.' }
  return { ok: true }
}

export async function skipKolOnboardingTelegram(): Promise<boolean> {
  const res = await fetch(`${API}/api/kol-program/onboarding/telegram/skip`, {
    method: 'POST',
    credentials: 'include',
  })
  return res.ok
}
