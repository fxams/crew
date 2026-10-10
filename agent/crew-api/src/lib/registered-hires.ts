/**
 * Bridge registered KOLs into Autohire scoring without circular imports.
 */

import { query } from './db.js'
import type { RegisteredHireBoost } from './agent/narrative.js'

export async function listRegisteredHireBoosts(): Promise<RegisteredHireBoost[]> {
  try {
    const { rows } = await query<{ x_username: string; wallet: string }>(
      `SELECT x_username, wallet FROM kol_registrations`,
    )
    return rows
      .map((row) => ({
        handle: String(row.x_username || '')
          .replace(/^@+/, '')
          .toLowerCase(),
        wallet: String(row.wallet || ''),
      }))
      .filter((r) => r.handle && r.wallet.length >= 32)
  } catch {
    return []
  }
}
