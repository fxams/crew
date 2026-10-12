/**
 * Treasury / fee-lock integrity helpers (security group 5).
 *
 * - Prove updateFeeSharesV2 revoked admin (shares no longer editable).
 * - Mark holderKol launches that stay unlocked past 24h as unlocked_expired.
 */

import { PublicKey, type AccountInfo } from '@solana/web3.js'
import { createRequire } from 'node:module'
import { PumpSdk } from './pump.js'
import { getConnection } from './send.js'

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pump = require('@pump-fun/pump-sdk') as typeof import('@pump-fun/pump-sdk')
const { feeSharingConfigPda, isSharingConfigEditable } = pump

/** Holder-KOL coins left unlocked longer than this are marked unlocked_expired. */
export const HOLDER_KOL_UNLOCK_TTL_MS = 24 * 60 * 60 * 1000

export type SharingConfigLike = {
  version: number
  adminRevoked: boolean
}

/** True when Pump fee-share admin can no longer edit shareholders. */
export function isFeeShareAdminRevoked(cfg: SharingConfigLike): boolean {
  if (cfg.version === 1) return true
  return Boolean(cfg.adminRevoked)
}

/** Decode a sharing-config account (live or fixture) and report admin-revoked state. */
export function adminRevokedFromSharingAccount(
  accountInfo: AccountInfo<Buffer>,
  sdk: InstanceType<typeof PumpSdk> = new PumpSdk(),
): { adminRevoked: boolean; editable: boolean; version: number } {
  const cfg = sdk.decodeSharingConfig(accountInfo)
  const adminRevoked = isFeeShareAdminRevoked(cfg)
  return {
    adminRevoked,
    editable: isSharingConfigEditable({ sharingConfig: cfg }),
    version: cfg.version,
  }
}

/**
 * After updateFeeSharesV2 lands, re-read sharing-config and assert admin is revoked.
 * Throws when the config is missing or still editable.
 */
export async function assertAdminRevokedOnChain(mint: PublicKey | string): Promise<boolean> {
  const mintPk = typeof mint === 'string' ? new PublicKey(mint.trim()) : mint
  const connection = getConnection()
  const pda = feeSharingConfigPda(mintPk)
  const info = await connection.getAccountInfo(pda, 'confirmed')
  if (!info) {
    throw new Error('Sharing config missing after fee-share lock — cannot verify adminRevoked')
  }
  const { adminRevoked, editable } = adminRevokedFromSharingAccount(info)
  if (!adminRevoked || editable) {
    throw new Error(
      'Fee-share landed but admin not revoked (shares still editable) — refusing to mark locked',
    )
  }
  return true
}

/** Backoff between sharing-config re-reads (~15s total) to ride RPC lag. */
export function feeLockPollDelaysMs(): number[] {
  return [400, 800, 1_200, 1_600, 2_000, 2_500, 3_000, 4_000]
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Poll sharing-config until admin is revoked. Returns false on timeout
 * (caller must not mark the coin locked).
 */
export async function pollAdminRevokedOnChain(
  mint: PublicKey | string,
  opts?: {
    delaysMs?: number[]
    probe?: (mint: PublicKey) => Promise<boolean>
  },
): Promise<boolean> {
  const mintPk = typeof mint === 'string' ? new PublicKey(mint.trim()) : mint
  const delays = opts?.delaysMs ?? feeLockPollDelaysMs()
  const probe =
    opts?.probe ??
    (async (m: PublicKey) => {
      await assertAdminRevokedOnChain(m)
      return true
    })
  for (let i = 0; i <= delays.length; i += 1) {
    try {
      if (await probe(mintPk)) return true
    } catch {
      /* RPC lag — sharing-config may not be indexed yet */
    }
    const wait = delays[i]
    if (wait == null) break
    await sleep(wait)
  }
  return false
}

export function shouldMarkUnlockedExpired(
  coin: {
    holderKol?: boolean
    feeShareSignature?: string | null
    launchedAt: number
    unlockedExpired?: boolean
  },
  now = Date.now(),
): boolean {
  if (coin.feeShareSignature) return false
  if (!coin.holderKol) return false
  if (coin.unlockedExpired) return true
  return now - coin.launchedAt >= HOLDER_KOL_UNLOCK_TTL_MS
}
