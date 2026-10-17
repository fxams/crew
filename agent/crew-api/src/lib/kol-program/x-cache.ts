import { query } from '../db.js'

const DAY_MS = 24 * 60 * 60 * 1000

export async function getXJsonCache<T>(key: string): Promise<T | null> {
  const { rows } = await query<{ body: unknown; expires_at: Date }>(
    `SELECT body, expires_at FROM kol_program_x_cache WHERE cache_key = $1`,
    [key],
  )
  const row = rows[0]
  if (!row || row.expires_at.getTime() < Date.now()) return null
  return row.body as T
}

export async function setXJsonCache(key: string, body: unknown, ttlMs = DAY_MS): Promise<void> {
  const expires = new Date(Date.now() + ttlMs)
  await query(
    `INSERT INTO kol_program_x_cache (cache_key, body, expires_at)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (cache_key) DO UPDATE SET body = EXCLUDED.body, expires_at = EXCLUDED.expires_at`,
    [key, JSON.stringify(body), expires],
  )
}
