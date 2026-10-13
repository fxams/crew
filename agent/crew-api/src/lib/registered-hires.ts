/**
 * Bridge registered KOLs into Autohire scoring without circular imports.
 */

import { query } from './db.js'
import { isPayoutWallet } from './agent/shareholders.js'
import type { RegisteredHireBoost } from './agent/narrative.js'

export async function listRegisteredHireBoosts(): Promise<RegisteredHireBoost[]> {
  try {
    let rows: Array<{
      x_username: string
      wallet: string
      evm_wallet?: string | null
      followers: number
      registered_at: string
    }>
    try {
      ;({ rows } = await query(
        `SELECT x_username, wallet, evm_wallet, followers, registered_at FROM kol_registrations`,
      ))
    } catch {
      ;({ rows } = await query(
        `SELECT x_username, wallet, followers, registered_at FROM kol_registrations`,
      ))
    }
    return rows
      .map((row) => ({
        handle: String(row.x_username || '')
          .replace(/^@+/, '')
          .toLowerCase(),
        wallet: String(row.wallet || ''),
        evmWallet: row.evm_wallet ? String(row.evm_wallet) : undefined,
        followers: Number(row.followers || 0),
        registeredAt: row.registered_at ? new Date(String(row.registered_at)).toISOString() : undefined,
      }))
      // Add a wallet to get hired and paid. KOLs without a wallet are skipped for crews.
      .filter((r) => r.handle && isPayoutWallet(r.wallet))
  } catch {
    return []
  }
}
