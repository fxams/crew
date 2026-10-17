import { query } from '../db.js'

export function kolFoundingSnapshotAt(): Date | null {
  const raw = (process.env.KOL_FOUNDING_SNAPSHOT_AT || '').trim()
  if (!raw) return null
  const t = Date.parse(raw)
  return Number.isFinite(t) ? new Date(t) : null
}

export function kolFoundingTopN(): number {
  return Math.min(2000, Math.max(1, Number(process.env.KOL_FOUNDING_TOP_N || 500)))
}

export type FoundingRow = {
  badgeNumber: number
  handle: string
  seasonPoints: number
  reachScore: number
  snapshotAt: string
}

/** Off-chain founding badge list — frozen after snapshot time. */
export async function ensureFoundingSnapshot(): Promise<FoundingRow[]> {
  const at = kolFoundingSnapshotAt()
  if (!at || Date.now() < at.getTime()) {
    return listFoundingRows()
  }

  const existing = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM kol_program_founding_snapshot`,
  )
  if (Number(existing.rows[0]?.n || 0) > 0) {
    return listFoundingRows()
  }

  const topN = kolFoundingTopN()
  const { rows } = await query<Record<string, unknown>>(
    `SELECT x_username, season_points, reach_score
     FROM kol_program_profiles
     WHERE revoked = false AND flagged_reason IS NULL
     ORDER BY season_points DESC, reach_score DESC, enrolled_at ASC
     LIMIT $1`,
    [topN],
  )

  const snapshotAt = at.toISOString()
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    await query(
      `INSERT INTO kol_program_founding_snapshot (badge_number, x_username, season_points, reach_score, snapshot_at)
       VALUES ($1,$2,$3,$4,$5::timestamptz)
       ON CONFLICT (badge_number) DO NOTHING`,
      [
        i + 1,
        String(r.x_username),
        Number(r.season_points),
        Number(r.reach_score),
        snapshotAt,
      ],
    )
  }
  return listFoundingRows()
}

export async function listFoundingRows(): Promise<FoundingRow[]> {
  const { rows } = await query<{
    badge_number: number
    x_username: string
    season_points: number
    reach_score: number
    snapshot_at: Date
  }>(
    `SELECT badge_number, x_username, season_points, reach_score, snapshot_at
     FROM kol_program_founding_snapshot
     ORDER BY badge_number ASC`,
  )
  return rows.map((r) => ({
    badgeNumber: Number(r.badge_number),
    handle: String(r.x_username),
    seasonPoints: Number(r.season_points),
    reachScore: Number(r.reach_score),
    snapshotAt: new Date(r.snapshot_at).toISOString(),
  }))
}

export async function foundingBadgeForHandle(handle: string): Promise<number | null> {
  const h = handle.replace(/^@+/, '').toLowerCase()
  const { rows } = await query<{ badge_number: number }>(
    `SELECT badge_number FROM kol_program_founding_snapshot WHERE lower(x_username) = $1`,
    [h],
  )
  return rows[0] ? Number(rows[0].badge_number) : null
}
