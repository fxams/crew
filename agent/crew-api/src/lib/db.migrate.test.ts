import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

function loadMigrateSources() {
  const src = readFileSync(join(here, 'db.ts'), 'utf8')
  const schema = readFileSync(join(here, '../schema.sql'), 'utf8')
  const split = src.split('await query(sql)')
  return { src, schema, firstBlock: split[0] || '', afterSchema: split.slice(1).join('await query(sql)') }
}

/** Live coins table as of 018 / immediately before #127. */
const PRE_127_COINS_COLUMNS = new Set([
  'mint',
  'id',
  'name',
  'ticker',
  'vibe',
  'mode',
  'signature',
  'fee_share_signature',
  'launched_at',
  'launcher',
  'pump_url',
  'buyback_rule',
  'raid_quests',
  'agent',
  'holder_kol',
  'unlocked_expired',
  'admin_revoked',
  'agent_key_id',
  'created_at',
  'updated_at',
])

const SQL_KEYWORDS = new Set([
  'asc',
  'desc',
  'null',
  'not',
  'is',
  'and',
  'or',
  'true',
  'false',
  'lower',
  'upper',
  'where',
  'on',
  'if',
])

type SchemaIndex = { name: string; table: string; columns: string[] }

function parseSchemaIndexes(schema: string): SchemaIndex[] {
  const re =
    /CREATE(?:\s+UNIQUE)?\s+INDEX\s+IF\s+NOT\s+EXISTS\s+(\w+)\s+ON\s+(\w+)\s*\(([\s\S]*?)\)(?:\s+WHERE\s+([\s\S]*?))?;/gi
  const out: SchemaIndex[] = []
  for (const m of schema.matchAll(re)) {
    const name = m[1]!
    const table = m[2]!
    const raw = `${m[3] || ''} ${m[4] || ''}`
    const columns = [...raw.matchAll(/\b([a-z_][a-z0-9_]*)\b/gi)]
      .map((x) => x[1]!.toLowerCase())
      .filter((id) => !SQL_KEYWORDS.has(id) && id !== name && id !== table)
    out.push({ name, table, columns: [...new Set(columns)] })
  }
  return out
}

function preAddedColumns(firstBlock: string): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  const re =
    /ALTER TABLE (\w+) ADD COLUMN IF NOT EXISTS (\w+)/gi
  for (const m of firstBlock.matchAll(re)) {
    const table = m[1]!
    const col = m[2]!
    if (!map.has(table)) map.set(table, new Set())
    map.get(table)!.add(col)
  }
  return map
}

function applySchemaIndexesToExistingTable(
  indexes: SchemaIndex[],
  table: string,
  existing: Set<string>,
) {
  for (const idx of indexes.filter((i) => i.table === table)) {
    for (const col of idx.columns) {
      if (!existing.has(col)) {
        const err = Object.assign(new Error(`column "${col}" does not exist`), {
          code: '42703',
          index: idx.name,
        })
        throw err
      }
    }
  }
}

/**
 * Live DBs already have kol_oauth_states, so CREATE TABLE IF NOT EXISTS is a
 * no-op. schema.sql still creates kol_oauth_states_cookie_idx on consumed_at —
 * those columns must be pre-added in the first DO $mig$ block.
 */
describe('migrate() pre-schema column adds', () => {
  it('adds kol_oauth_states signature_sha256 and consumed_at before schema.sql', () => {
    const { firstBlock, schema } = loadMigrateSources()

    expect(schema).toMatch(/kol_oauth_states_cookie_idx[\s\S]*consumed_at IS NULL/)

    const referral = firstBlock.indexOf(
      'ALTER TABLE kol_oauth_states ADD COLUMN IF NOT EXISTS referral_code TEXT',
    )
    const cookie = firstBlock.indexOf(
      'ALTER TABLE kol_oauth_states ADD COLUMN IF NOT EXISTS cookie_sha256 TEXT',
    )
    const signature = firstBlock.indexOf(
      'ALTER TABLE kol_oauth_states ADD COLUMN IF NOT EXISTS signature_sha256 TEXT',
    )
    const consumed = firstBlock.indexOf(
      'ALTER TABLE kol_oauth_states ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ',
    )
    expect(referral).toBeGreaterThan(-1)
    expect(cookie).toBeGreaterThan(referral)
    expect(signature).toBeGreaterThan(cookie)
    expect(consumed).toBeGreaterThan(signature)
  })
})

describe('migrate() against an existing pre-#127 coins table', () => {
  it('does not CREATE INDEX coins_graduated_unfeatured_idx in schema.sql', () => {
    const { schema, afterSchema } = loadMigrateSources()
    expect(schema).not.toMatch(
      /CREATE(?:\s+UNIQUE)?\s+INDEX[\s\S]{0,80}coins_graduated_unfeatured_idx/i,
    )
    expect(afterSchema).toMatch(/019_featured_graduation/)
    expect(afterSchema).toMatch(/020_agent_keys_ops/)
    const alter = afterSchema.indexOf(
      'ALTER TABLE coins ADD COLUMN IF NOT EXISTS graduated_at TIMESTAMPTZ',
    )
    const idx = afterSchema.indexOf('CREATE INDEX IF NOT EXISTS coins_graduated_unfeatured_idx')
    expect(alter).toBeGreaterThan(-1)
    expect(idx).toBeGreaterThan(alter)
  })

  it('applies schema.sql indexes to a live pre-#127 coins table without 42703', () => {
    const { schema, firstBlock } = loadMigrateSources()
    const existing = new Set(PRE_127_COINS_COLUMNS)
    for (const col of preAddedColumns(firstBlock).get('coins') || []) existing.add(col)

    expect(() =>
      applySchemaIndexesToExistingTable(parseSchemaIndexes(schema), 'coins', existing),
    ).not.toThrow()
  })

  it('would 42703 if schema.sql still indexed graduated_at on a pre-#127 coins table', () => {
    const poison = `
      CREATE INDEX IF NOT EXISTS coins_graduated_unfeatured_idx
        ON coins (graduated_at ASC)
        WHERE graduated_at IS NOT NULL AND (featured_x_url IS NULL OR featured_x_url = '');
    `
    try {
      applySchemaIndexesToExistingTable(parseSchemaIndexes(poison), 'coins', PRE_127_COINS_COLUMNS)
      throw new Error('expected 42703')
    } catch (err) {
      expect(err).toMatchObject({ code: '42703' })
      expect((err as Error).message).toMatch(/column "graduated_at" does not exist/)
    }
  })
})

describe('schema.sql indexes vs ALTER-only columns', () => {
  it('does not index ALTER-added columns unless they are pre-added before query(sql)', () => {
    const { src, schema, firstBlock } = loadMigrateSources()
    const pre = preAddedColumns(firstBlock)
    const alterCols = new Map<string, Set<string>>()
    for (const m of src.matchAll(/ALTER TABLE (\w+) ADD COLUMN IF NOT EXISTS (\w+)/gi)) {
      const table = m[1]!
      const col = m[2]!
      if (!alterCols.has(table)) alterCols.set(table, new Set())
      alterCols.get(table)!.add(col)
    }
    const violations = parseSchemaIndexes(schema).flatMap((idx) =>
      idx.columns
        .filter((col) => alterCols.get(idx.table)?.has(col) && !pre.get(idx.table)?.has(col))
        .map((col) => `${idx.name} uses ${idx.table}.${col} (ALTER-only, not pre-added before schema.sql)`),
    )
    expect(violations).toEqual([])
  })
})
