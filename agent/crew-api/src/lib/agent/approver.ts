/**
 * Dry-run approval allowlist.
 *
 * Only wallets in CREWPAY_APPROVER_WALLETS (comma/space separated) and/or the
 * owner_wallet registered on the issuing API key may approve. The launcher /
 * burner pubkey named on the dry-run is always rejected. If the allowlist is
 * empty after combining env + owner, all approvals are refused.
 */

import { PublicKey } from '@solana/web3.js'
import { getOwnerWalletByFingerprint } from '../agent-keys.js'

export function normalizeWallet(addr: string): string | null {
  try {
    return new PublicKey(addr.trim()).toBase58()
  } catch {
    return null
  }
}

/** Parse CREWPAY_APPROVER_WALLETS (alias CREW_APPROVER_WALLETS). */
export function parseApproverAllowlist(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const raw = (env.CREWPAY_APPROVER_WALLETS || env.CREW_APPROVER_WALLETS || '').trim()
  if (!raw) return []
  const out: string[] = []
  for (const part of raw.split(/[,\s]+/)) {
    const n = normalizeWallet(part)
    if (n) out.push(n)
  }
  return [...new Set(out)]
}

export async function resolveApproverAllowlist(opts: {
  apiKeyFp: string
  env?: NodeJS.ProcessEnv
}): Promise<string[]> {
  const allow = new Set(parseApproverAllowlist(opts.env))
  try {
    const owner = await getOwnerWalletByFingerprint(opts.apiKeyFp)
    const n = owner ? normalizeWallet(owner) : null
    if (n) allow.add(n)
  } catch {
    /* DB unavailable in unit tests — env-only allowlist still applies */
  }
  return [...allow]
}

/**
 * Throw if wallet may not approve this dry-run.
 * Pure check when `allowlist` is passed (tests); otherwise loads env + owner.
 */
export async function assertWalletMayApprove(opts: {
  wallet: string
  apiKeyFp: string
  /** Burner / launcher pubkey from the dry-run — never an approver. */
  launcherPubkey?: string | null
  /** Precomputed allowlist for tests (skips env/DB). */
  allowlist?: string[]
}): Promise<void> {
  const wallet = normalizeWallet(opts.wallet)
  if (!wallet) throw new Error('Invalid approver wallet')

  const launcher = opts.launcherPubkey ? normalizeWallet(opts.launcherPubkey) : null
  if (launcher && wallet === launcher) {
    throw new Error('Launcher/burner wallet cannot approve dry-runs')
  }

  const allow =
    opts.allowlist !== undefined
      ? opts.allowlist.map((w) => normalizeWallet(w)).filter((w): w is string => Boolean(w))
      : await resolveApproverAllowlist({ apiKeyFp: opts.apiKeyFp })

  if (allow.length === 0) {
    throw new Error(
      'Approvals disabled — set CREWPAY_APPROVER_WALLETS or register an owner wallet on the API key',
    )
  }

  if (!allow.includes(wallet)) {
    throw new Error('Wallet is not on the approver allowlist')
  }
}
