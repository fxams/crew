/**
 * Bridge registered KOLs into Autohire scoring without circular imports.
 */

import { query } from './db.js'
import { isPayoutWallet } from './agent/shareholders.js'
import type { RegisteredHireBoost } from './agent/narrative.js'
import { kolProgramEnabled } from './kol-program/flags.js'

export async function listRegisteredHireBoosts(): Promise<RegisteredHireBoost[]> {
  try {
    let rows: Array<{
      x_username: string
      wallet: string
      evm_wallet?: string | null
      followers: number
      registered_at: string
      x_user_id?: string
      x_verified?: boolean
      tg_channel_verified?: boolean
      tg_reach?: number | null
      tg_channel_verified_at?: string | null
      season_points?: number | null
      founder_number?: number | null
      crew_priority_opt_in?: boolean | null
      flagged_reason?: string | null
      revoked?: boolean | null
    }>
    const programOn = kolProgramEnabled()
    try {
      ;({ rows } = await query(
        programOn
          ? `SELECT r.x_username, r.wallet, r.evm_wallet, r.followers, r.registered_at, r.x_user_id, r.x_verified,
                    r.tg_channel_verified, r.tg_reach, r.tg_channel_verified_at,
                    p.season_points, p.founder_number, p.crew_priority_opt_in, p.flagged_reason, p.revoked
             FROM kol_registrations r
             LEFT JOIN kol_program_profiles p ON p.x_user_id = r.x_user_id`
          : `SELECT x_username, wallet, evm_wallet, followers, registered_at, x_user_id, x_verified,
                    tg_channel_verified, tg_reach, tg_channel_verified_at
             FROM kol_registrations`,
      ))
    } catch {
      try {
        ;({ rows } = await query(
          `SELECT x_username, wallet, evm_wallet, followers, registered_at, x_user_id, x_verified, tg_channel_verified, tg_reach FROM kol_registrations`,
        ))
      } catch {
        ;({ rows } = await query(
          `SELECT x_username, wallet, followers, registered_at FROM kol_registrations`,
        ))
      }
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
        tgOnlyUnverified:
          String(row.x_user_id || '').startsWith('tg:') &&
          !row.x_verified &&
          !row.tg_channel_verified,
        tgChannelVerified: Boolean(row.tg_channel_verified),
        tgReach:
          row.tg_reach != null && Number.isFinite(Number(row.tg_reach)) ? Number(row.tg_reach) : null,
        tgChannelVerifiedAt: row.tg_channel_verified_at
          ? new Date(String(row.tg_channel_verified_at)).toISOString()
          : null,
        kolSeasonPoints:
          programOn && row.season_points != null ? Number(row.season_points) : undefined,
        kolFounderNumber:
          programOn && row.founder_number != null ? Number(row.founder_number) : undefined,
        kolCrewPriority:
          programOn &&
          !row.revoked &&
          !row.flagged_reason &&
          row.crew_priority_opt_in !== false,
      }))
      // Add a wallet to get hired and paid. KOLs without a wallet are skipped for crews.
      .filter((r) => r.handle && isPayoutWallet(r.wallet))
  } catch {
    return []
  }
}
