/**
 * Bridge registered KOLs into Autohire scoring without circular imports.
 */

import { query } from './db.js'
import type { RegisteredHireBoost } from './agent/narrative.js'

export async function listRegisteredHireBoosts(): Promise<RegisteredHireBoost[]> {
  try {
    const { rows } = await query<{ x_username: string; wallet: string; followers: number; registered_at: string }>(
      `SELECT x_username, wallet, followers, registered_at FROM kol_registrations`,
    )
    return rows
      .map((row) => ({
        handle: String(row.x_username || '')
          .replace(/^@+/, '')
          .toLowerCase(),
        wallet: String(row.wallet || ''),
        followers: Number(row.followers || 0),
        registeredAt: row.registered_at ? new Date(String(row.registered_at)).toISOString() : undefined,
      }))
      .filter((r) => r.handle && r.wallet.length >= 32)
  } catch {
    return []
  }
}
