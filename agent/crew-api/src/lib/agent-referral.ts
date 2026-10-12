/**
 * Agent-key referral: KOL code bound at claim-key time.
 * Referred launches split fees 60% crew / 15% agent / 5% referrer / 20% treasury.
 * "Referral" means only this 5% creator-fee share — not a KOL-seat carve-out.
 */

import { PublicKey } from '@solana/web3.js'
import { randomBytes } from 'node:crypto'
import { AGENT_REFERRAL_BPS, REFERRAL_CLAIM_DAILY_CAP } from './agent/constants.js'
import { normalizeShareholderRole } from './agent/shareholders.js'
import { query } from './db.js'
import { normalizeReferralCode, siteUrl } from './kol-register.js'

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

/** Lowercase + strip non-alphanumerics for self-referral name compares. */
export function normalizeReferralName(raw: string): string {
  return raw.replace(/^@+/, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * True when candidate matches referrer handle (exact, or prefix/suffix after normalize).
 * e.g. referrer "crewpayhq" blocks "crewpayhq-bot", "bot_crewpayhq".
 */
export function namesMatchSelfReferral(
  referrerName: string,
  candidate: string,
): boolean {
  const ref = normalizeReferralName(referrerName)
  const cand = normalizeReferralName(candidate)
  if (!ref || ref.length < 2 || !cand) return false
  if (ref === cand) return true
  if (cand.startsWith(ref) || cand.endsWith(ref)) return true
  return false
}

/** True when launcher/owner wallet or X/label matches the referring KOL. */
export function isSelfReferral(opts: {
  referrerWallet: string
  referrerXUsername?: string | null
  ownerWallet?: string | null
  launcherWallet?: string | null
  ownerXUsername?: string | null
  agentLabel?: string | null
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
      /* ignore */
    }
  }
  const refX = opts.referrerXUsername || ''
  if (normalizeReferralName(refX).length >= 2) {
    if (opts.ownerXUsername && namesMatchSelfReferral(refX, opts.ownerXUsername)) {
      return true
    }
    const label = opts.agentLabel || ''
    if (label && namesMatchSelfReferral(refX, label)) return true
    for (const part of label.split(/[:\s/|_-]+/)) {
      if (part && namesMatchSelfReferral(refX, part)) return true
    }
  }
  return false
}

export async function countReferralClaimsToday(code: string): Promise<number> {
  const normalized = normalizeReferralCode(code)
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n
     FROM agent_keys
     WHERE lower(referral_code) = $1
       AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')`,
    [normalized],
  )
  return Number(rows[0]?.n || 0)
}

/** Enforce daily cap, registration-IP self-referral block, and log for review. */
export async function assertReferralClaimAllowed(
  referrer: AgentReferrer,
  opts?: { claimIp?: string | null },
): Promise<void> {
  const n = await countReferralClaimsToday(referrer.code)
  if (n >= REFERRAL_CLAIM_DAILY_CAP) {
    throw new Error(
      `Referral code "${referrer.code}" hit the daily claim cap (${REFERRAL_CLAIM_DAILY_CAP}/day UTC). Try again tomorrow.`,
    )
  }
  const claimIp = (opts?.claimIp || '').trim()
  if (claimIp) {
    const { rows } = await query(
      `SELECT register_ip FROM kol_registrations
       WHERE lower(referral_code) = $1 LIMIT 1`,
      [referrer.code],
    )
    const regIp = rows[0]?.register_ip ? String(rows[0].register_ip).trim() : ''
    if (regIp && regIp === claimIp) {
      throw new Error(
        'Self-referral blocked — claim IP matches the referrer KOL registration IP.',
      )
    }
  }
}

export async function logReferralKeyClaim(opts: {
  keyId: string
  fingerprint: string
  referralCode: string
  referrerWallet: string
  referrerHandle: string
  label: string
  ip?: string
}): Promise<void> {
  const id = `arc_${randomBytes(8).toString('hex')}`
  try {
    await query(
      `INSERT INTO agent_referral_claims (
         id, agent_key_id, fingerprint, referral_code, referrer_wallet, referrer_handle, label, ip
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        id,
        opts.keyId,
        opts.fingerprint,
        opts.referralCode,
        opts.referrerWallet,
        opts.referrerHandle,
        opts.label.slice(0, 64),
        (opts.ip || '').slice(0, 64) || null,
      ],
    )
  } catch (err) {
    console.warn(
      'agent_referral_claims insert failed',
      err instanceof Error ? err.message : err,
    )
  }
  console.info(
    JSON.stringify({
      event: 'agent_referral_key_claimed',
      keyId: opts.keyId,
      fingerprint: opts.fingerprint,
      referralCode: opts.referralCode,
      referrerWallet: opts.referrerWallet,
      referrerHandle: opts.referrerHandle,
      label: opts.label,
      ip: opts.ip || null,
    }),
  )
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
 * Referral bound on a claimed key whose owner_wallet matches this payer
 * (x402 identity — no API key on the request).
 */
export async function getAgentReferralByOwnerWallet(wallet: string): Promise<{
  code: string
  referrer: AgentReferrer
} | null> {
  const w = wallet.trim()
  if (!w) return null
  const { rows } = await query(
    `SELECT referral_code FROM agent_keys
     WHERE active = true AND referral_code IS NOT NULL AND referral_code <> ''
       AND owner_wallet IS NOT NULL
       AND (owner_wallet = $1 OR lower(owner_wallet) = lower($1))
     LIMIT 1`,
    [w],
  )
  const code = rows[0]?.referral_code ? String(rows[0].referral_code) : ''
  if (!code) return null
  try {
    const referrer = await resolveAgentReferrer(code)
    return { code: referrer.code, referrer }
  } catch {
    return null
  }
}

/**
 * Resolve agent referrer for a launch.
 * Self-referral drops the cut. Referrer-in-crew keeps the referrer — fee map pays
 * max(crew seat, 5% referral) so a tiny seat cannot dodge the floor.
 */
export async function resolveLaunchAgentReferrer(opts: {
  keyId?: string | null
  ownerWallet?: string | null
  launcherWallet?: string | null
  ownerXUsername?: string | null
  agentLabel?: string | null
  crewWallets?: string[]
}): Promise<{
  referrer: AgentReferrer | null
  warning?: string
  dualRoleInCrew?: boolean
}> {
  const bound = opts.keyId
    ? await getAgentKeyReferral(opts.keyId)
    : opts.ownerWallet
      ? await getAgentReferralByOwnerWallet(opts.ownerWallet)
      : null
  if (!bound) return { referrer: null }
  if (
    isSelfReferral({
      referrerWallet: bound.referrer.wallet,
      referrerXUsername: bound.referrer.xUsername,
      ownerWallet: opts.ownerWallet,
      launcherWallet: opts.launcherWallet,
      ownerXUsername: opts.ownerXUsername,
      agentLabel: opts.agentLabel,
    })
  ) {
    return {
      referrer: null,
      warning:
        'Agent referral ignored — referring KOL matches owner wallet/X (self-referral blocked).',
    }
  }
  if (opts.crewWallets?.length) {
    const ref = bound.referrer.wallet
    for (const w of opts.crewWallets) {
      try {
        if (new PublicKey(w.trim()).toBase58() === ref) {
          return {
            referrer: bound.referrer,
            dualRoleInCrew: true,
            warning:
              'Referrer is also in this launch crew — paid max(crew seat, 5% referral floor); no separate referrer wallet.',
          }
        }
      } catch {
        /* ignore */
      }
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
  /** Remits attributed to agent-referral role on referred launches. */
  referralFeesEarnedSol: number
  referralRemitCount: number
  /** Remits attributed to crew role (hired seat), separate from referral. */
  crewFeesEarnedSol: number
  crewRemitCount: number
  /** @deprecated use referralFeesEarnedSol — kept for older clients */
  feesEarnedSol: number
  remitCount: number
}

/** Persist on-chain fee recipients for earnings attribution. */
export async function upsertCoinShareholders(
  mint: string,
  shareholders: Array<{ wallet: string; bps: number; role?: string; handle?: string }>,
): Promise<void> {
  if (!mint || !shareholders.length) return
  await query(`DELETE FROM coin_shareholders WHERE mint = $1`, [mint])
  for (const s of shareholders) {
    const role = normalizeShareholderRole(s.role)
    await query(
      `INSERT INTO coin_shareholders (mint, wallet, role, handle, bps)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (mint, wallet, role) DO UPDATE SET handle = EXCLUDED.handle, bps = EXCLUDED.bps`,
      [mint, s.wallet, role, (s.handle || '').slice(0, 32), s.bps],
    )
  }
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
       AND c.fee_share_signature IS NOT NULL
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

  // Attribute remits by fee-share recipient role per mint (not wallet totals).
  const { rows: refFeeRows } = await query(
    `SELECT COALESCE(SUM(r.amount_sol), 0) AS total, COUNT(*)::int AS n
     FROM remits r
     INNER JOIN coins c ON c.mint = r.mint AND c.fee_share_signature IS NOT NULL
     INNER JOIN coin_shareholders cs
       ON cs.mint = r.mint AND cs.wallet = r.wallet AND cs.role = 'agent-referral'
     WHERE r.wallet = $1`,
    [wallet],
  )
  const { rows: crewFeeRows } = await query(
    `SELECT COALESCE(SUM(r.amount_sol), 0) AS total, COUNT(*)::int AS n
     FROM remits r
     INNER JOIN coins c ON c.mint = r.mint AND c.fee_share_signature IS NOT NULL
     INNER JOIN coin_shareholders cs
       ON cs.mint = r.mint AND cs.wallet = r.wallet
      AND cs.role IN ('crew', 'kol')
     WHERE r.wallet = $1`,
    [wallet],
  )
  const referralFeesEarnedSol = Number(refFeeRows[0]?.total || 0)
  const referralRemitCount = Number(refFeeRows[0]?.n || 0)
  const crewFeesEarnedSol = Number(crewFeeRows[0]?.total || 0)
  const crewRemitCount = Number(crewFeeRows[0]?.n || 0)

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
    referralFeesEarnedSol,
    referralRemitCount,
    crewFeesEarnedSol,
    crewRemitCount,
    feesEarnedSol: referralFeesEarnedSol,
    remitCount: referralRemitCount,
  }
}
