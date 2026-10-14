import type { Request } from 'express'
import { assertAllowlistedApprover, resolveApproverAllowlist } from './agent/approver.js'
import {
  adminAuthConfigured,
  matchAdminToken,
  readAdminSecrets,
  type AdminAuthResult,
} from './farcaster-admin-auth.js'
import { verifyWalletSignature } from './wallet-auth.js'

export type AdminOpsAuthResult =
  | { ok: true; via: 'token' | 'wallet' }
  | { ok: false; status: 401 | 503; error: string }

function opsAdminWallet(req: Request, messagePrefix: string): string {
  const wallet = (req.header('x-crew-wallet') || '').trim()
  const tsRaw = (req.header('x-crew-timestamp') || '').trim()
  const signature = (req.header('x-crew-signature') || '').trim()
  const timestamp = Number(tsRaw)
  if (!wallet || !tsRaw || !signature || !Number.isFinite(timestamp)) {
    throw new Error('Wallet signature required (x-crew-wallet, x-crew-timestamp, x-crew-signature)')
  }
  if (Math.abs(Date.now() - timestamp) > 10 * 60_000) {
    throw new Error('Signature expired')
  }
  const message = `${messagePrefix}${timestamp}`
  const ok = verifyWalletSignature({ wallet, message, signatureBase58: signature })
  if (!ok) throw new Error('Invalid wallet signature')
  return assertAllowlistedApprover(wallet)
}

/** Admin ops: CREW_ADMIN_TOKEN / ADMIN_TOKEN or allowlisted operator wallet (same as kickoff). */
export function authorizeAdminOps(req: Request): AdminOpsAuthResult {
  const tokenConfigured = adminAuthConfigured()
  const walletAllowlist = resolveApproverAllowlist()
  if (
    process.env.NODE_ENV === 'production' &&
    !tokenConfigured &&
    walletAllowlist.length === 0
  ) {
    return {
      ok: false,
      status: 503,
      error: 'Admin ops not configured — set ADMIN_TOKEN or CREWPAY_APPROVER_WALLETS',
    }
  }

  const { token } = readAdminSecrets(req)
  if (matchAdminToken(token)) return { ok: true, via: 'token' }

  try {
    opsAdminWallet(req, 'crew-ops-admin:')
    return { ok: true, via: 'wallet' }
  } catch {
    /* fall through */
  }

  return { ok: false, status: 401, error: 'Unauthorized' }
}

export type { AdminAuthResult }
