import { query } from './db.js'

export type ApiKol = {
  id: string
  rank: number
  pump: string
  x: string | null
  followers: number
  wallet: string
  aliases: string[]
  narratives: string[]
  correlated: string[]
  roles: string[]
}

function mapRow(r: Record<string, unknown>): ApiKol {
  return {
    id: String(r.id),
    rank: Number(r.rank),
    pump: String(r.pump),
    x: r.x ? String(r.x) : null,
    followers: Number(r.followers || 0),
    wallet: String(r.wallet),
    aliases: (r.aliases as string[]) || [],
    narratives: (r.narratives as string[]) || [],
    correlated: (r.correlated as string[]) || [],
    roles: (r.roles as string[]) || [],
  }
}

export async function countKols(): Promise<number> {
  const { rows } = await query<{ n: string }>(`SELECT count(*)::text AS n FROM kols`)
  return Number(rows[0]?.n || 0)
}

export async function listKols(opts: {
  q?: string
  limit?: number
  offset?: number
}): Promise<ApiKol[]> {
  const limit = Math.min(500, Math.max(1, opts.limit ?? 50))
  const offset = Math.max(0, opts.offset ?? 0)
  const q = (opts.q || '').trim().replace(/^@/, '').toLowerCase()

  if (!q) {
    const { rows } = await query(
      `SELECT * FROM kols ORDER BY rank ASC LIMIT $1 OFFSET $2`,
      [limit, offset],
    )
    return rows.map((r) => mapRow(r as Record<string, unknown>))
  }

  const { rows } = await query(
    `SELECT * FROM kols
     WHERE lower(pump) = $1
        OR lower(coalesce(x,'')) = $1
        OR $1 = ANY (SELECT lower(a) FROM unnest(aliases) a)
        OR wallet = $2
        OR lower(pump) LIKE $3
        OR lower(coalesce(x,'')) LIKE $3
     ORDER BY rank ASC
     LIMIT $4 OFFSET $5`,
    [q, opts.q?.trim() || q, `${q}%`, limit, offset],
  )
  return rows.map((r) => mapRow(r as Record<string, unknown>))
}

export async function getKolByWallet(wallet: string): Promise<ApiKol | null> {
  const { rows } = await query(`SELECT * FROM kols WHERE wallet = $1 LIMIT 1`, [
    wallet.trim(),
  ])
  return rows[0] ? mapRow(rows[0] as Record<string, unknown>) : null
}

export async function upsertKol(kol: ApiKol): Promise<void> {
  await query(
    `INSERT INTO kols (
       id, rank, pump, x, followers, wallet, aliases, narratives, correlated, roles, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
     ON CONFLICT (id) DO UPDATE SET
       rank = EXCLUDED.rank,
       pump = EXCLUDED.pump,
       x = EXCLUDED.x,
       followers = EXCLUDED.followers,
       wallet = EXCLUDED.wallet,
       aliases = EXCLUDED.aliases,
       narratives = EXCLUDED.narratives,
       correlated = EXCLUDED.correlated,
       roles = EXCLUDED.roles,
       updated_at = now()`,
    [
      kol.id,
      kol.rank,
      kol.pump,
      kol.x,
      kol.followers,
      kol.wallet,
      kol.aliases,
      kol.narratives,
      kol.correlated,
      kol.roles,
    ],
  )
}
