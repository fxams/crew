/**
 * Dry-run approval allowlist.
 *
 * Only wallets in CREWPAY_APPROVER_WALLETS (comma/space separated) may approve.
 * API-key ownerWallet is intentionally NOT trusted — agents holding crew_ak_…
 * must not be able to register an approver and self-approve.
 *
 * The launcher/burner pubkey named on the dry-run is always rejected.
 * If the allowlist is empty, all approvals are refused.
 */

import { PublicKey } from '@solana/web3.js'

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

/** Env-only allowlist — never merges API-key ownerWallet. */
export function resolveApproverAllowlist(opts?: {
  env?: NodeJS.ProcessEnv
}): string[] {
  return parseApproverAllowlist(opts?.env)
}

/**
 * Throw if wallet may not approve this dry-run.
 * Pure check when `allowlist` is passed (tests); otherwise loads env.
 */
export async function assertWalletMayApprove(opts: {
  wallet: string
  /** Burner / launcher pubkey from the dry-run — required; never an approver. */
  launcherPubkey: string | null | undefined
  /** Precomputed allowlist for tests (skips env). */
  allowlist?: string[]
}): Promise<void> {
  const wallet = normalizeWallet(opts.wallet)
  if (!wallet) throw new Error('Invalid approver wallet')

  const launcher = opts.launcherPubkey ? normalizeWallet(opts.launcherPubkey) : null
  if (!launcher) {
    throw new Error('Dry-run missing launcherPubkey — refuse approval')
  }
  if (wallet === launcher) {
    throw new Error('Launcher/burner wallet cannot approve dry-runs')
  }

  const allow =
    opts.allowlist !== undefined
      ? opts.allowlist.map((w) => normalizeWallet(w)).filter((w): w is string => Boolean(w))
      : resolveApproverAllowlist()

  if (allow.length === 0) {
    throw new Error(
      'Approvals disabled — set CREWPAY_APPROVER_WALLETS (comma-separated operator wallets)',
    )
  }

  if (!allow.includes(wallet)) {
    throw new Error('Wallet is not on the approver allowlist')
  }
}

/** Kickoff admin: allowlisted operator wallet only (no launcher check, no new secrets). */
export function assertAllowlistedApprover(walletRaw: string, allowlist?: string[]): string {
  const wallet = normalizeWallet(walletRaw)
  if (!wallet) throw new Error('Invalid admin wallet')
  const allow =
    allowlist !== undefined
      ? allowlist.map((w) => normalizeWallet(w)).filter((w): w is string => Boolean(w))
      : resolveApproverAllowlist()
  if (allow.length === 0) {
    throw new Error('Approvals disabled — set CREWPAY_APPROVER_WALLETS')
  }
  if (!allow.includes(wallet)) {
    throw new Error('Wallet is not on the approver allowlist')
  }
  return wallet
}
