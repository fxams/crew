import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Live DBs already have kol_oauth_states, so CREATE TABLE IF NOT EXISTS is a
 * no-op. schema.sql still creates kol_oauth_states_cookie_idx on consumed_at —
 * those columns must be pre-added in the first DO $mig$ block.
 */
describe('migrate() pre-schema column adds', () => {
  it('adds kol_oauth_states signature_sha256 and consumed_at before schema.sql', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const src = readFileSync(join(here, 'db.ts'), 'utf8')
    const schema = readFileSync(join(here, '../schema.sql'), 'utf8')
    const firstBlock = src.split('await query(sql)')[0] || ''

    expect(schema).toMatch(/kol_oauth_states_cookie_idx[\s\S]*consumed_at IS NULL/)

    const referral = firstBlock.indexOf(
      'ALTER TABLE kol_oauth_states ADD COLUMN IF NOT EXISTS referral_code TEXT',
    )
    const signature = firstBlock.indexOf(
      'ALTER TABLE kol_oauth_states ADD COLUMN IF NOT EXISTS signature_sha256 TEXT',
    )
    const consumed = firstBlock.indexOf(
      'ALTER TABLE kol_oauth_states ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ',
    )
    expect(referral).toBeGreaterThan(-1)
    expect(signature).toBeGreaterThan(referral)
    expect(consumed).toBeGreaterThan(signature)
  })
})
