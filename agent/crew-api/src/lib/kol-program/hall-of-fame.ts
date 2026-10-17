import { query } from '../db.js'

export const HALL_OF_FAME_TOP = 10

export type HallOfFameEntry = {
  seasonId: string
  seasonNumber: number
  rank: number
  handle: string
  seasonPoints: number
}

export type HofBadge = {
  seasonId: string
  seasonNumber: number
  rank: number
  label: string
}

export async function seasonOrdinal(seasonId: string): Promise<number> {
  const { rows } = await query<{ ord: string }>(
    `SELECT (ROW_NUMBER() OVER (ORDER BY starts_at ASC))::text AS ord
     FROM kol_program_seasons
     WHERE id = $1`,
    [seasonId],
  )
  const n = Number(rows[0]?.ord || 0)
  if (n > 0) return n
  const { rows: all } = await query<{ id: string }>(
    `SELECT id FROM kol_program_seasons ORDER BY starts_at ASC`,
  )
  const idx = all.findIndex((r) => r.id === seasonId)
  return idx >= 0 ? idx + 1 : 1
}

export function hofBadgeLabel(seasonNumber: number): string {
  return `Season ${seasonNumber} top KOL`
}

/** Persist top-10 rows into hall of fame + per-handle badges (idempotent). */
export async function persistHallOfFame(
  seasonId: string,
  ranked: Array<{ handle: string; seasonPoints: number; rank: number }>,
): Promise<void> {
  const seasonNumber = await seasonOrdinal(seasonId)
  const top = ranked.filter((r) => r.rank >= 1 && r.rank <= HALL_OF_FAME_TOP)
  for (const row of top) {
    const handle = row.handle.replace(/^@+/, '').toLowerCase()
    await query(
      `INSERT INTO kol_program_hall_of_fame (season_id, season_number, rank, handle, season_points)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (season_id, rank) DO UPDATE SET
         handle = EXCLUDED.handle,
         season_points = EXCLUDED.season_points,
         season_number = EXCLUDED.season_number`,
      [seasonId, seasonNumber, row.rank, handle, row.seasonPoints],
    )
    await query(
      `INSERT INTO kol_program_hof_badges (handle, season_id, season_number, rank)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (handle, season_id) DO UPDATE SET
         season_number = EXCLUDED.season_number,
         rank = EXCLUDED.rank`,
      [handle, seasonId, seasonNumber, row.rank],
    )
  }
}

/** Backfill hall of fame from season archive when missing. */
export async function ensureHallOfFameFromArchive(seasonId: string): Promise<void> {
  const { rows: existing } = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM kol_program_hall_of_fame WHERE season_id = $1`,
    [seasonId],
  )
  if (Number(existing[0]?.n || 0) >= 1) return
  const { rows } = await query<Record<string, unknown>>(
    `SELECT rank, handle, season_points FROM kol_program_season_archive
     WHERE season_id = $1 AND rank <= $2 ORDER BY rank ASC`,
    [seasonId, HALL_OF_FAME_TOP],
  )
  if (!rows.length) return
  await persistHallOfFame(
    seasonId,
    rows.map((r) => ({
      rank: Number(r.rank),
      handle: String(r.handle),
      seasonPoints: Number(r.season_points),
    })),
  )
}

export async function listHallOfFameBySeason(seasonId: string): Promise<HallOfFameEntry[]> {
  await ensureHallOfFameFromArchive(seasonId)
  const { rows } = await query<Record<string, unknown>>(
    `SELECT season_id, season_number, rank, handle, season_points
     FROM kol_program_hall_of_fame WHERE season_id = $1 ORDER BY rank ASC`,
    [seasonId],
  )
  return rows.map((r) => ({
    seasonId: String(r.season_id),
    seasonNumber: Number(r.season_number),
    rank: Number(r.rank),
    handle: String(r.handle),
    seasonPoints: Number(r.season_points),
  }))
}

export async function listHallOfFameAll(): Promise<
  Array<{ seasonId: string; seasonNumber: number; name: string; top: HallOfFameEntry[] }>
> {
  const { rows: seasons } = await query<Record<string, unknown>>(
    `SELECT id, name, archived_at FROM kol_program_seasons
     WHERE archived_at IS NOT NULL ORDER BY starts_at DESC LIMIT 24`,
  )
  const out: Array<{ seasonId: string; seasonNumber: number; name: string; top: HallOfFameEntry[] }> = []
  for (const s of seasons) {
    const seasonId = String(s.id)
    await ensureHallOfFameFromArchive(seasonId)
    const top = await listHallOfFameBySeason(seasonId)
    if (!top.length) continue
    out.push({
      seasonId,
      seasonNumber: top[0]?.seasonNumber ?? (await seasonOrdinal(seasonId)),
      name: String(s.name),
      top,
    })
  }
  return out
}

export async function hofBadgesForHandle(handle: string): Promise<HofBadge[]> {
  const h = handle.replace(/^@+/, '').toLowerCase()
  const { rows } = await query<Record<string, unknown>>(
    `SELECT season_id, season_number, rank FROM kol_program_hof_badges
     WHERE lower(handle) = $1 ORDER BY season_number DESC`,
    [h],
  )
  return rows.map((r) => {
    const seasonNumber = Number(r.season_number)
    return {
      seasonId: String(r.season_id),
      seasonNumber,
      rank: Number(r.rank),
      label: hofBadgeLabel(seasonNumber),
    }
  })
}

const MEDALS = ['🥇', '🥈', '🥉'] as const

/** Ready-to-post @CrewPayHQ copy — no earnings or payout claims. */
export function buildSeasonShoutoutText(
  seasonNumber: number,
  top: Array<{ rank: number; handle: string; seasonPoints: number }>,
): string {
  const lines = top
    .filter((r) => r.rank >= 1 && r.rank <= HALL_OF_FAME_TOP)
    .sort((a, b) => a.rank - b.rank)
    .map((r) => {
      const medal = MEDALS[r.rank - 1] ?? '•'
      const handle = r.handle.replace(/^@+/, '')
      return `${medal} @${handle} — ${r.seasonPoints} pts`
    })
  return [
    `Season ${seasonNumber} KOL leaderboard on @CrewPayHQ`,
    '',
    'Top crew this season (program points — no cash or token value):',
    ...lines,
    '',
    'Register: crewpay.dev/register · Leaderboard: crewpay.dev/kol/leaderboard',
  ].join('\n')
}

export async function shoutoutForSeason(seasonId: string): Promise<{ seasonNumber: number; text: string; top: HallOfFameEntry[] }> {
  await ensureHallOfFameFromArchive(seasonId)
  const top = await listHallOfFameBySeason(seasonId)
  const seasonNumber = top[0]?.seasonNumber ?? (await seasonOrdinal(seasonId))
  const text = buildSeasonShoutoutText(
    seasonNumber,
    top.map((t) => ({ rank: t.rank, handle: t.handle, seasonPoints: t.seasonPoints })),
  )
  return { seasonNumber, text, top }
}
