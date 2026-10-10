import pg from 'pg'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const { Pool } = pg

let pool: pg.Pool | null = null

export function getPool(): pg.Pool {
  if (pool) return pool
  const connectionString = process.env.DATABASE_URL?.trim()
  if (!connectionString) {
    throw new Error('DATABASE_URL is required')
  }
  pool = new Pool({
    connectionString,
    ssl: connectionString.includes('localhost')
      ? undefined
      : { rejectUnauthorized: false },
    max: 10,
  })
  return pool
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params)
}

export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const out = await fn(client)
    await client.query('COMMIT')
    return out
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function migrate(): Promise<void> {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const sql = readFileSync(join(__dirname, '../schema.sql'), 'utf8')

  // Live DBs created before agent_key_id: CREATE TABLE IF NOT EXISTS is a no-op,
  // but schema.sql still creates coins_agent_key_id_idx which requires the column.
  // Add the column first when coins already exists (fixes update_failed deploys).
  await query(`
    DO $mig$
    BEGIN
      IF to_regclass('public.coins') IS NOT NULL THEN
        ALTER TABLE coins ADD COLUMN IF NOT EXISTS agent_key_id TEXT;
      END IF;
    END
    $mig$;
  `)

  await query(sql)
  await query(
    `INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT DO NOTHING`,
    ['001_init'],
  )
  // Additive alters (CREATE IF NOT EXISTS in schema.sql will not change live tables).
  await query(`ALTER TABLE coins ADD COLUMN IF NOT EXISTS agent_key_id TEXT`)
  await query(
    `CREATE INDEX IF NOT EXISTS coins_agent_key_id_idx ON coins (agent_key_id) WHERE agent_key_id IS NOT NULL`,
  )
  await query(
    `INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT DO NOTHING`,
    ['002_coins_agent_key_id'],
  )
  await query(
    `ALTER TABLE kol_registrations ADD COLUMN IF NOT EXISTS prior_wallets TEXT[] NOT NULL DEFAULT '{}'`,
  )
  await query(`
    CREATE TABLE IF NOT EXISTS kol_mention_drafts (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'posted', 'rejected')),
      mint TEXT NOT NULL DEFAULT '',
      signature TEXT NOT NULL DEFAULT '',
      handle TEXT NOT NULL DEFAULT '',
      wallet TEXT NOT NULL DEFAULT '',
      amount_sol NUMERIC(20, 9) NOT NULL DEFAULT 0,
      draft_text TEXT NOT NULL,
      x_post_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
  await query(
    `CREATE INDEX IF NOT EXISTS kol_mention_drafts_status_idx ON kol_mention_drafts (status, created_at DESC)`,
  )
  await query(
    `INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT DO NOTHING`,
    ['003_kol_prior_wallets_mentions'],
  )
  await query(
    `ALTER TABLE kol_registrations ADD COLUMN IF NOT EXISTS referral_code TEXT`,
  )
  await query(
    `ALTER TABLE kol_registrations ADD COLUMN IF NOT EXISTS referred_by_code TEXT`,
  )
  await query(
    `ALTER TABLE kol_oauth_states ADD COLUMN IF NOT EXISTS referral_code TEXT`,
  )
  // Backfill codes from username for existing registrations.
  await query(`
    UPDATE kol_registrations
    SET referral_code = lower(regexp_replace(x_username, '[^a-zA-Z0-9_]', '', 'g'))
    WHERE referral_code IS NULL
      AND x_username IS NOT NULL
      AND length(regexp_replace(x_username, '[^a-zA-Z0-9_]', '', 'g')) >= 2
  `)
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS kol_registrations_referral_code_idx
      ON kol_registrations (lower(referral_code)) WHERE referral_code IS NOT NULL
  `)
  await query(
    `CREATE INDEX IF NOT EXISTS kol_registrations_referred_by_idx
      ON kol_registrations (lower(referred_by_code))`,
  )
  await query(
    `INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT DO NOTHING`,
    ['004_kol_referral_codes'],
  )
}
