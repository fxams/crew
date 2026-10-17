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

export type KolProgramSeason = {
  id: string
  name: string
  startsAt: string
  endsAt: string | null
  archivedAt: string | null
  current: boolean
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
      reachFormula: body.reachFormula,
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
} | null> {
  const res = await fetch(`${API}/api/kol-program/leaderboard?limit=${limit}`)
  if (!res.ok) return null
  const body = (await res.json()) as {
    seasonId: string
    rows: KolLeaderboardRow[]
    disclaimer: string
  }
  return body
}

export async function fetchKolProgramSeasons(seasonId?: string): Promise<{
  seasons: KolProgramSeason[]
  archive: KolLeaderboardRow[] | null
  archiveSeasonId: string | null
} | null> {
  const q = seasonId ? `?seasonId=${encodeURIComponent(seasonId)}` : ''
  const res = await fetch(`${API}/api/kol-program/seasons${q}`)
  if (!res.ok) return null
  return (await res.json()) as {
    seasons: KolProgramSeason[]
    archive: KolLeaderboardRow[] | null
    archiveSeasonId: string | null
  }
}

export function kolProgramCardUrl(handle: string, ext: 'svg' | 'png' = 'png'): string {
  const h = handle.replace(/^@+/, '')
  return `${API}/api/kol-program/card/${encodeURIComponent(h)}.${ext}`
}
