/**
 * Agent-key referral program: KOL code bound at claim-key time.
 * Referred launches split fees 60% crew / 15% agent / 5% referrer / 20% treasury.
 */

import { PublicKey } from '@solana/web3.js'
import { query } from './db.js'
import { normalizeReferralCode, siteUrl } from './kol-register.js'
import { AGENT_REFERRAL_BPS } from './agent/constants.js'

export type AgentReferrer = {
  code: string
  wallet: string
  handle: string
  xUsername: string
}

export function agentReferralLink(code: string): string {
  const base = siteUrl().replace(/\/$/, '')
  return `${base}/r/${encodeURIComponent(normalizeReferralCode(code))}`
}

/** Resolve a live KOL referral code → referrer wallet/handle. Throws on unknown. */
export async function resolveAgentReferrer(rawCode: string): Promise<AgentReferrer> {
  const code = normalizeReferralCode(rawCode)
  if (code.length < 2) {
    throw new Error('Invalid referralCode — use a registered KOL code (2+ chars).')
  }
  const { rows } = await query(
    `SELECT referral_code, wallet, x_username
     FROM kol_registrations
     WHERE lower(referral_code) = $1
     LIMIT 1`,
    [code],
  )
  const row = rows[0]
  if (!row?.wallet || !row.referral_code) {
    throw new Error(
      `Unknown referralCode "${code}" — register at ${siteUrl()}/register or use an existing KOL code.`,
    )
  }
  let wallet: string
  try {
    wallet = new PublicKey(String(row.wallet).trim()).toBase58()
  } catch {
    throw new Error(`Referral code "${code}" has an invalid referrer wallet on file.`)
  }
  const xUsername = String(row.x_username || '').replace(/^@+/, '')
  return {
    code: String(row.referral_code).toLowerCase(),
    wallet,
    handle: xUsername ? `@${xUsername}` : '@referrer',
    xUsername,
  }
}

/** True when launcher/owner wallet is the same as the referring KOL (self-referral). */
export function isSelfReferral(opts: {
  referrerWallet: string
  ownerWallet?: string | null
  launcherWallet?: string | null
}): boolean {
  let ref: string
  try {
    ref = new PublicKey(opts.referrerWallet.trim()).toBase58()
  } catch {
    return false
  }
  for (const raw of [opts.ownerWallet, opts.launcherWallet]) {
    if (!raw?.trim()) continue
    try {
      if (new PublicKey(raw.trim()).toBase58() === ref) return true
    } catch {
      /* ignore bad wallets */
    }
  }
  return false
}

export async function getAgentKeyReferral(keyId: string): Promise<{
  code: string
  referrer: AgentReferrer
} | null> {
  if (!keyId) return null
  const { rows } = await query(
    `SELECT referral_code FROM agent_keys WHERE id = $1 AND active = true LIMIT 1`,
    [keyId],
  )
  const code = rows[0]?.referral_code ? String(rows[0].referral_code) : ''
  if (!code) return null
  const referrer = await resolveAgentReferrer(code)
  return { code: referrer.code, referrer }
}

/**
 * Resolve agent referrer for a launch, applying self-referral anti-abuse.
 * Returns null (and optional warning) when self-referral would apply.
 */
export async function resolveLaunchAgentReferrer(opts: {
  keyId?: string | null
  ownerWallet?: string | null
  launcherWallet?: string | null
}): Promise<{
  referrer: AgentReferrer | null
  warning?: string
  dualRoleCrewHandles?: string[]
}> {
  if (!opts.keyId) return { referrer: null }
  const bound = await getAgentKeyReferral(opts.keyId)
  if (!bound) return { referrer: null }
  if (
    isSelfReferral({
      referrerWallet: bound.referrer.wallet,
      ownerWallet: opts.ownerWallet,
      launcherWallet: opts.launcherWallet,
    })
  ) {
    return {
      referrer: null,
      warning:
        'Agent referral ignored — referring KOL wallet matches ownerWallet/launcher (self-referral blocked).',
    }
  }
  return { referrer: bound.referrer }
}

export type KolReferralStats = {
  referralCode: string
  referralLink: string
  cutBps: number
  cutPct: number
  feeMapReferred: {
    crewPoolBps: number
    deskBps: number
    referrerBps: number
    platformBuybackBps: number
  }
  agents: Array<{
    keyId: string
    label: string
    fingerprint: string
    claimedAt: string
  }>
  launches: Array<{
    mint: string
    ticker: string
    name: string
    launchedAt: string
    agentKeyId: string
    feeShareLocked: boolean
  }>
  feesEarnedSol: number
  remitCount: number
}

/** Dashboard stats for a registered KOL (by wallet). */
export async function getKolReferralStats(walletRaw: string): Promise<KolReferralStats | null> {
  let wallet: string
  try {
    wallet = new PublicKey(walletRaw.trim()).toBase58()
  } catch {
    return null
  }
  const { rows: kolRows } = await query(
    `SELECT referral_code, x_username, wallet
     FROM kol_registrations WHERE wallet = $1 LIMIT 1`,
    [wallet],
  )
  const kol = kolRows[0]
  if (!kol?.referral_code) return null
  const code = String(kol.referral_code).toLowerCase()

  const { rows: agentRows } = await query(
    `SELECT id, label, fingerprint, created_at
     FROM agent_keys
     WHERE active = true AND lower(referral_code) = $1
     ORDER BY created_at DESC
     LIMIT 200`,
    [code],
  )
  const agents = agentRows.map((r) => ({
    keyId: String(r.id),
    label: String(r.label),
    fingerprint: String(r.fingerprint),
    claimedAt: new Date(String(r.created_at)).toISOString(),
  }))

  const { rows: launchRows } = await query(
    `SELECT c.mint, c.ticker, c.name, c.launched_at, c.agent_key_id, c.fee_share_signature
     FROM coins c
     INNER JOIN agent_keys ak ON ak.id = c.agent_key_id
     WHERE lower(ak.referral_code) = $1
     ORDER BY c.launched_at DESC
     LIMIT 200`,
    [code],
  )
  const launches = launchRows.map((r) => ({
    mint: String(r.mint),
    ticker: String(r.ticker),
    name: String(r.name),
    launchedAt: new Date(String(r.launched_at)).toISOString(),
    agentKeyId: String(r.agent_key_id),
    feeShareLocked: Boolean(r.fee_share_signature),
  }))

  const { rows: feeRows } = await query(
    `SELECT COALESCE(SUM(amount_sol), 0) AS total, COUNT(*)::int AS n
     FROM remits
     WHERE wallet = $1`,
    [wallet],
  )
  const feesEarnedSol = Number(feeRows[0]?.total || 0)
  const remitCount = Number(feeRows[0]?.n || 0)

  return {
    referralCode: code,
    referralLink: agentReferralLink(code),
    cutBps: AGENT_REFERRAL_BPS,
    cutPct: AGENT_REFERRAL_BPS / 100,
    feeMapReferred: {
      crewPoolBps: 6000,
      deskBps: 1500,
      referrerBps: AGENT_REFERRAL_BPS,
      platformBuybackBps: 2500 - AGENT_REFERRAL_BPS,
    },
    agents,
    launches,
    feesEarnedSol,
    remitCount,
  }
}
