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
}
