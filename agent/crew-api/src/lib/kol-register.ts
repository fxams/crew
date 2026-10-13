/**
 * Opt-in KOL registration: prove a Solana wallet, then sign in with X and store public stats.
 */

import { createHash, randomBytes } from 'node:crypto'
import { houseHandles, isHouseHandle } from './agent/optout.js'
import { PublicKey } from '@solana/web3.js'
import bs58 from 'bs58'
import nacl from 'tweetnacl'
import { KOL_DB } from './agent/narrative.js'
import { assertEvmAddress, isEvmAddress } from './agent/evm-address.js'
import { isPayoutWallet } from './agent/shareholders.js'
import { query } from './db.js'
import { verifyWalletSignature } from './wallet-auth.js'
import {
  REGISTRATION_OAUTH_TTL_MS,
  REGISTRATION_OAUTH_TTL_SEC,
  SESSION_USED_ERROR,
  cookieSha256,
  registrationStateSecret,
  resolveRegistrationOAuth,
  sha256Hex,
  signRegistrationOAuthState,
  walletLinkedElsewhereError,
  type StoredOAuthState,
} from './kol-oauth-state.js'

export const REGISTER_MESSAGE_PREFIX = 'CrewPay KOL registration'

/** Unsigned wallet switches stay pending this long unless the current wallet signs. */
export const WALLET_CHANGE_PENDING_MS = 48 * 60 * 60_000
const WALLET_CHANGE_SIG_TTL_MS = 10 * 60_000

export function buildWalletChangeMessage(newWallet: string, timestamp: number): string {
  return `crew-kol-wallet-change:${newWallet}:${timestamp}`
}

export type WalletChangeDecision = {
  action: 'set' | 'pending'
  wallet: string
  pendingWallet: string | null
  pendingUntil: Date | null
}

/**
 * Bind a KOL re-registration wallet switch to the currently linked wallet.
 * Signed OAuth state is still the source of truth for the callback; this only
 * queues the payout-wallet change.
 */
export function decideWalletChange(opts: {
  currentWallet: string
  newWallet: string
  nowMs?: number
  changeSignature?: string
  changeTimestamp?: number
}): WalletChangeDecision {
  const now = opts.nowMs ?? Date.now()
  if (!opts.currentWallet || opts.currentWallet === opts.newWallet) {
    return {
      action: 'set',
      wallet: opts.newWallet,
      pendingWallet: null,
      pendingUntil: null,
    }
  }
  const ts = Number(opts.changeTimestamp)
  const fresh = Number.isFinite(ts) && Math.abs(now - ts) <= WALLET_CHANGE_SIG_TTL_MS
  const okSig =
    fresh &&
    Boolean(opts.changeSignature) &&
    verifyWalletSignature({
      wallet: opts.currentWallet,
      message: buildWalletChangeMessage(opts.newWallet, ts),
      signatureBase58: String(opts.changeSignature),
    })
  if (okSig) {
    return {
      action: 'set',
      wallet: opts.newWallet,
      pendingWallet: null,
      pendingUntil: null,
    }
  }
  return {
    action: 'pending',
    wallet: opts.currentWallet,
    pendingWallet: opts.newWallet,
    pendingUntil: new Date(now + WALLET_CHANGE_PENDING_MS),
  }
}

/**
 * Agent-key referral: % of total creator fees (from treasury) when agents claim with your code.
 * Not a KOL-seat carve — that program was removed.
 */
export const KOL_REFERRAL_CUT_PCT = 5
/** Points awarded when someone registers with your code (future CREW airdrop weight). */
export const REFERRAL_POINTS_REGISTER = 100
/** Points when a KOL who registered with your code is hired (airdrop weight — not a fee cut). */
export const REFERRAL_POINTS_HIRE = 250
/** Referred account must have at least this many X followers to earn register points. */
export const REFERRAL_POINTS_MIN_FOLLOWERS = 50
/** Max register-point awards credited to one referrer code per UTC day (sybil brake). */
export const REFERRAL_POINTS_REGISTER_DAILY_CAP = 10

export type KolRegistration = {
  xUserId?: string
  xUsername: string
  xName: string
  xVerified: boolean
  followers: number
  following: number
  tweetCount: number
  listedCount: number
  profileImageUrl: string | null
  description: string
  wallet: string
  /** Optional Base / EVM address — required to be paid on Zora launches. */
  evmWallet: string | null
  /** Wallet requested via OAuth but not yet signed by the current linked wallet. */
  pendingWallet?: string | null
  pendingUntil?: string | null
  /** Directory / previously linked wallets — desk earnings include these. */
  priorWallets: string[]
  /** Unique shareable code — every registered KOL has one. */
  referralCode: string
  /** Direct referrer code (set once at first registration). */
  referredByCode: string | null
  referralCount: number
  /** Cached referral points for a future CREW airdrop. */
  referralPoints: number
  solEarned: number
  registeredAt: string
  updatedAt: string
  statsRefreshedAt: string
  rank: number
  telegramUserId?: string | null
  telegramUsername?: string | null
  telegramChatId?: string | null
  telegramAlerts?: boolean
  tgChannel?: string | null
  tgChannelVerified?: boolean
  tgReach?: number | null
  telegramOnly?: boolean
}

export function normalizeReferralCode(raw: string): string {
  return raw
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 24)
}

export function referralCodeFromUsername(username: string): string {
  const base = normalizeReferralCode(username)
  return base.length >= 2 ? base : `crew${randomBytes(3).toString('hex')}`
}

/** Scraped Pump directory wallet for an X handle, if any. */
export function directoryWalletForHandle(username: string): string | null {
  const handle = username.trim().replace(/^@+/, '').toLowerCase()
  if (!handle) return null
  const hit = KOL_DB.find((kol) => {
    const x = (kol.x || '').replace(/^@+/, '').toLowerCase()
    const pump = (kol.pump || '').replace(/^@+/, '').toLowerCase()
    return x === handle || pump === handle
  })
  return hit?.wallet && hit.wallet.length >= 32 ? hit.wallet : null
}

function walletsForRow(wallet: string, prior: unknown): string[] {
  const out = new Set<string>()
  if (wallet?.length >= 32) out.add(wallet)
  if (Array.isArray(prior)) {
    for (const w of prior) {
      if (typeof w === 'string' && w.length >= 32) out.add(w)
    }
  }
  return [...out]
}

/** X serves a tiny `_normal` avatar. The profile desk wants the larger file. */
export function xAvatarLarge(url: string | null | undefined): string | null {
  if (!url) return null
  return url.replace(/_(normal|mini|bigger)(\.[a-z0-9]+)$/i, '_400x400$2')
}

/** OAuth sometimes stores X's gray default egg instead of the real profile photo. */
export function isDefaultXProfileImage(url: string | null | undefined): boolean {
  if (!url?.trim()) return true
  return /default_profile_images|default_profile_\d|\/sticky\/default/i.test(url)
}

/** Public lookup when OAuth saved the default avatar URL. */
export async function fetchPublicXAvatarUrl(username: string): Promise<string | null> {
  const handle = username.trim().replace(/^@/, '')
  if (!X_HANDLE.test(handle)) return null
  try {
    const res = await fetch(`https://unavatar.io/x/${encodeURIComponent(handle)}?json`, {
      headers: { 'user-agent': 'CrewPay-KOL-Desk/1.0' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { url?: string }
    const url = json.url?.trim()
    if (!url || isDefaultXProfileImage(url)) return null
    return url
  } catch {
    return null
  }
}

async function ensureDeskAvatar(profile: KolRegistration): Promise<KolRegistration> {
  let url = profile.profileImageUrl
  if (!isDefaultXProfileImage(url)) {
    return { ...profile, profileImageUrl: xAvatarLarge(url) }
  }
  const resolved = await fetchPublicXAvatarUrl(profile.xUsername)
  if (resolved) {
    await query(
      `UPDATE kol_registrations
       SET profile_image_url = $1, updated_at = now()
       WHERE lower(x_username) = lower($2)`,
      [resolved, profile.xUsername],
    )
    url = resolved
  }
  return { ...profile, profileImageUrl: xAvatarLarge(url) }
}

export function registrationMessage(wallet: string, nonce: string): string {
  return `${REGISTER_MESSAGE_PREFIX}\nWallet: ${wallet.trim()}\nNonce: ${nonce.trim()}`
}

export function verifyWalletLink(wallet: string, message: string, signatureB58: string): boolean {
  try {
    const pk = new PublicKey(wallet.trim())
    const sig = bs58.decode(signatureB58.trim())
    if (sig.length !== 64) return false
    return nacl.sign.detached.verify(new TextEncoder().encode(message), sig, pk.toBytes())
  } catch {
    return false
  }
}

export function xOAuthConfigured(): boolean {
  return Boolean(process.env.X_CLIENT_ID?.trim() && process.env.X_CLIENT_SECRET?.trim())
}

export function xRedirectUri(): string {
  return (
    process.env.X_REDIRECT_URI?.trim() ||
    'https://api.crewpay.dev/api/kols/register/callback'
  )
}

export function siteUrl(): string {
  return (process.env.SITE_URL?.trim() || 'https://crewpay.dev').replace(/\/$/, '')
}

function b64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

export function codeChallengeS256(verifier: string): string {
  return b64url(createHash('sha256').update(verifier).digest())
}

export function buildXAuthorizeUrl(opts: { state: string; codeVerifier: string }): string {
  const clientId = process.env.X_CLIENT_ID?.trim()
  if (!clientId) throw new Error('X_CLIENT_ID is not set')
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: xRedirectUri(),
    // users.read is required for /2/users/me. tweet.read is the base read scope.
    // offline.access is omitted — we do not store a refresh token.
    scope: 'users.read tweet.read',
    state: opts.state,
    code_challenge: codeChallengeS256(opts.codeVerifier),
    code_challenge_method: 'S256',
  })
  return `https://x.com/i/oauth2/authorize?${params.toString()}`
}

export async function issueNonce(wallet: string): Promise<{ nonce: string; message: string }> {
  new PublicKey(wallet.trim())
  await query(`DELETE FROM kol_oauth_nonces WHERE created_at < now() - interval '15 minutes'`)
  const nonce = randomBytes(16).toString('hex')
  await query(`INSERT INTO kol_oauth_nonces (nonce, wallet) VALUES ($1, $2)`, [
    nonce,
    wallet.trim(),
  ])
  return { nonce, message: registrationMessage(wallet.trim(), nonce) }
}

export async function beginXAuth(opts: {
  wallet?: string
  message?: string
  signature?: string
  referralCode?: string
  /** Optional Base address for Zora / 0xSplits payouts. */
  evmWallet?: string
  /** Client IP at /register/start — stored for claim-time self-referral checks. */
  ip?: string
  /** Optional CSRF cookie; hashed into the state row as a fallback only. */
  regCookie?: string
}): Promise<{ authorizeUrl: string; state: string; sid: string; wallet: string; expiresAt: number }> {
  if (!xOAuthConfigured()) {
    throw new Error('X sign-in is not configured. Set X_CLIENT_ID and X_CLIENT_SECRET on crewpay-api.')
  }
  const wallet = (opts.wallet || '').trim()
  const hasWallet = isPayoutWallet(wallet)
  const message = (opts.message || '').trim()
  const signature = (opts.signature || '').trim()
  if (wallet && !hasWallet) {
    throw new Error('Invalid Solana wallet.')
  }
  if (hasWallet) {
    if (!message || !signature) {
      throw new Error('Sign with the linked Solana wallet, or register with X only.')
    }
    const expectedPrefix = `${REGISTER_MESSAGE_PREFIX}\nWallet: ${wallet}\nNonce: `
    if (!message.startsWith(expectedPrefix)) {
      throw new Error('Registration message does not match this wallet.')
    }
    const nonce = message.slice(expectedPrefix.length).trim()
    if (!/^[a-f0-9]{32}$/.test(nonce)) throw new Error('Invalid registration nonce.')
    if (!verifyWalletLink(wallet, message, signature)) {
      throw new Error('Wallet signature did not verify. Sign with the linked Solana wallet.')
    }

    const { rows } = await query(`DELETE FROM kol_oauth_nonces WHERE nonce = $1 AND wallet = $2 RETURNING nonce`, [
      nonce,
      wallet,
    ])
    if (!rows.length) throw new Error('Registration nonce expired or already used. Start again.')
  } else if (message || signature) {
    throw new Error('Connect a Solana wallet to sign, or register with X only.')
  }

  let referralCode: string | null = null
  const wanted = normalizeReferralCode(opts.referralCode || '')
  if (wanted.length >= 2) {
    const found = await query<{ referral_code: string; wallet: string }>(
      `SELECT referral_code, wallet FROM kol_registrations WHERE lower(referral_code) = $1 LIMIT 1`,
      [wanted],
    )
    if (!found.rows[0]) {
      throw new Error('Unknown referral code.')
    }
    if (hasWallet && found.rows[0].wallet === wallet) {
      throw new Error('You cannot use your own referral code.')
    }
    referralCode = String(found.rows[0].referral_code)
  }

  let evmWallet: string | null = null
  const rawEvm = (opts.evmWallet || '').trim()
  if (rawEvm) {
    if (!isEvmAddress(rawEvm)) {
      throw new Error('EVM wallet must be a 0x address (40 hex chars) for Zora / Base payouts.')
    }
    evmWallet = assertEvmAddress(rawEvm, 'evmWallet')
  }

  await query(`DELETE FROM kol_oauth_states WHERE created_at < now() - interval '15 minutes'`)
  const sid = randomBytes(16).toString('hex')
  const codeVerifier = b64url(randomBytes(32))
  const ip = (opts.ip || '').trim().slice(0, 64) || null
  const cookieSha = opts.regCookie ? cookieSha256(opts.regCookie) : null
  const sigSha = hasWallet ? sha256Hex(signature) : sha256Hex(`x-only:${sid}`)
  const exp = Math.floor(Date.now() / 1000) + REGISTRATION_OAUTH_TTL_SEC
  const state = signRegistrationOAuthState(
    {
      v: 1,
      sid,
      w: hasWallet ? wallet : '',
      sh: sigSha,
      exp,
      ...(referralCode ? { r: referralCode } : {}),
      ...(evmWallet ? { e: evmWallet } : {}),
    },
    registrationStateSecret(),
  )
  await query(
    `INSERT INTO kol_oauth_states (
       state, code_verifier, wallet, referral_code, cookie_sha256, ip, evm_wallet, signature_sha256
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [sid, codeVerifier, hasWallet ? wallet : '', referralCode, cookieSha, ip, evmWallet, sigSha],
  )
  return {
    authorizeUrl: buildXAuthorizeUrl({ state, codeVerifier }),
    state,
    sid,
    wallet: hasWallet ? wallet : '',
    expiresAt: exp * 1000,
  }
}

function mapOAuthRow(r: Record<string, unknown> | undefined): StoredOAuthState | null {
  // X-only signup stores wallet as '' — must still resolve, or callback reports "already used".
  if (!r?.state || !r.code_verifier || r.wallet == null) return null
  const createdAtMs =
    r.created_at instanceof Date ? r.created_at.getTime() : Date.parse(String(r.created_at || ''))
  let consumedAtMs: number | null = null
  if (r.consumed_at) {
    consumedAtMs =
      r.consumed_at instanceof Date ? r.consumed_at.getTime() : Date.parse(String(r.consumed_at))
    if (!Number.isFinite(consumedAtMs)) consumedAtMs = null
  }
  return {
    sid: String(r.state),
    codeVerifier: String(r.code_verifier),
    wallet: String(r.wallet || ''),
    sigSha256: r.signature_sha256 ? String(r.signature_sha256) : null,
    referralCode: r.referral_code ? String(r.referral_code) : null,
    evmWallet: r.evm_wallet ? String(r.evm_wallet) : null,
    cookieSha256: r.cookie_sha256 ? String(r.cookie_sha256) : null,
    ip: r.ip ? String(r.ip) : null,
    createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : 0,
    consumedAtMs,
  }
}

const OAUTH_STATE_SELECT = `state, code_verifier, wallet, referral_code, cookie_sha256, ip, evm_wallet, signature_sha256, created_at, consumed_at`

async function loadOAuthStateBySid(sid: string): Promise<StoredOAuthState | null> {
  const { rows } = await query(`SELECT ${OAUTH_STATE_SELECT} FROM kol_oauth_states WHERE state = $1`, [
    sid,
  ])
  return mapOAuthRow(rows[0] as Record<string, unknown> | undefined)
}

async function loadOAuthStateByCookieSha(sha: string): Promise<StoredOAuthState | null> {
  const { rows } = await query(
    `SELECT ${OAUTH_STATE_SELECT} FROM kol_oauth_states
     WHERE cookie_sha256 = $1 AND consumed_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [sha],
  )
  return mapOAuthRow(rows[0] as Record<string, unknown> | undefined)
}

async function consumeOAuthState(sid: string): Promise<boolean> {
  const { rowCount } = await query(
    `UPDATE kol_oauth_states SET consumed_at = now() WHERE state = $1 AND consumed_at IS NULL`,
    [sid],
  )
  return (rowCount || 0) > 0
}

type XUser = {
  id: string
  username: string
  name?: string
  verified?: boolean
  description?: string
  profile_image_url?: string
  public_metrics?: {
    followers_count?: number
    following_count?: number
    tweet_count?: number
    listed_count?: number
  }
}

async function exchangeCode(code: string, codeVerifier: string): Promise<string> {
  const clientId = process.env.X_CLIENT_ID!.trim()
  const clientSecret = process.env.X_CLIENT_SECRET!.trim()
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: xRedirectUri(),
    code_verifier: codeVerifier,
    client_id: clientId,
  })
  const res = await fetch('https://api.x.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${basic}`,
    },
    body,
  })
  const json = (await res.json()) as { access_token?: string; error?: string; error_description?: string }
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || `X token HTTP ${res.status}`)
  }
  return json.access_token
}

async function fetchXMe(accessToken: string): Promise<XUser> {
  const url = new URL('https://api.x.com/2/users/me')
  url.searchParams.set(
    'user.fields',
    'public_metrics,description,verified,profile_image_url,created_at',
  )
  const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } })
  const json = (await res.json()) as { data?: XUser; detail?: string; title?: string }
  if (!res.ok || !json.data?.id || !json.data.username) {
    throw new Error(json.detail || json.title || `X user HTTP ${res.status}`)
  }
  return json.data
}

async function allocateReferralCode(username: string, xUserId: string): Promise<string> {
  const base = referralCodeFromUsername(username)
  for (let i = 0; i < 8; i += 1) {
    const candidate = i === 0 ? base : `${base}${i + 1}`
    const clash = await query(
      `SELECT x_user_id FROM kol_registrations
       WHERE lower(referral_code) = $1 AND x_user_id <> $2 LIMIT 1`,
      [candidate, xUserId],
    )
    if (!clash.rows.length) return candidate
  }
  return `${base}${randomBytes(2).toString('hex')}`
}

export async function completeXCallback(
  code: string,
  state: string,
  opts?: { regCookie?: string; headers?: Record<string, unknown> },
): Promise<KolRegistration> {
  const resolved = await resolveRegistrationOAuth({
    stateParam: state,
    regCookie: opts?.regCookie,
    secret: registrationStateSecret(),
    getBySid: loadOAuthStateBySid,
    getByCookieSha: loadOAuthStateByCookieSha,
  })
  if (!resolved.ok) {
    throw new Error(resolved.error)
  }
  const consumed = await consumeOAuthState(resolved.row.sid)
  if (!consumed) {
    throw new Error(SESSION_USED_ERROR)
  }
  const row = resolved.row
  const registerIp = (row.ip || '').trim().slice(0, 64) || null
  const evmWallet =
    row.evmWallet && isEvmAddress(row.evmWallet)
      ? assertEvmAddress(String(row.evmWallet), 'evmWallet')
      : null

  const accessToken = await exchangeCode(code, row.codeVerifier)
  const user = await fetchXMe(accessToken)
  let profileImageUrl = user.profile_image_url || null
  if (isDefaultXProfileImage(profileImageUrl)) {
    profileImageUrl = (await fetchPublicXAvatarUrl(user.username)) || profileImageUrl
  }
  const metrics = user.public_metrics || {}

  // Prevent linking conflicts across accounts (same wallet used elsewhere).
  if (isPayoutWallet(row.wallet)) {
    const conflict = await query<{ x_user_id: string; x_username: string }>(
      `SELECT x_user_id, x_username FROM kol_registrations WHERE wallet = $1 AND x_user_id <> $2 LIMIT 1`,
      [row.wallet, user.id],
    )
    if (conflict.rows.length) {
      throw new Error(walletLinkedElsewhereError(String(conflict.rows[0]!.x_username || 'that account')))
    }
  }

  const prior = new Set<string>()
  const directoryWallet = directoryWalletForHandle(user.username)
  if (directoryWallet && directoryWallet !== row.wallet) prior.add(directoryWallet)
  const existing = await query<{
    wallet: string
    prior_wallets: string[] | null
    referral_code: string | null
    referred_by_code: string | null
  }>(
    `SELECT wallet, prior_wallets, referral_code, referred_by_code FROM kol_registrations WHERE x_user_id = $1`,
    [user.id],
  )
  const prev = existing.rows[0]
  if (prev?.wallet && prev.wallet !== row.wallet) prior.add(prev.wallet)
  for (const w of prev?.prior_wallets || []) {
    if (w && w !== row.wallet) prior.add(w)
  }
  const priorWallets = [...prior]

  const ownCode =
    prev?.referral_code || (await allocateReferralCode(user.username, user.id))
  // Direct referral only — set once on first registration, never overwrite.
  let referredBy: string | null = prev?.referred_by_code || null
  if (!referredBy && row.referralCode) {
    const ref = normalizeReferralCode(row.referralCode)
    if (ref && ref !== normalizeReferralCode(ownCode)) {
      const ok = await query<{ referral_code: string; wallet: string; x_user_id: string }>(
        `SELECT referral_code, wallet, x_user_id FROM kol_registrations
         WHERE lower(referral_code) = $1 LIMIT 1`,
        [ref],
      )
      const referrer = ok.rows[0]
      // Block same-wallet / same-X self-referral; alt-identity sybil is capped via points rules.
      if (
        referrer &&
        referrer.x_user_id !== user.id &&
        (!isPayoutWallet(row.wallet) || referrer.wallet !== row.wallet) &&
        !(isPayoutWallet(referrer.wallet) && prior.has(referrer.wallet))
      ) {
        referredBy = String(referrer.referral_code)
      }
    }
  }

  const firstReferral = !prev?.referred_by_code && Boolean(referredBy)
  const referredFollowers = Number(metrics.followers_count || 0)
  // Wallet change handling: if existing row has a different wallet, do not overwrite
  // unless the current wallet signed an approval (crew-kol-wallet-change:{newWallet}:{ts}).
  // Signed OAuth state remains the callback source of truth (cookie is fallback only).
  let applyWallet = row.wallet
  let pendingWallet: string | null = null
  let pendingUntil: Date | null = null
  if (prev?.wallet && prev.wallet !== row.wallet) {
    if (!isPayoutWallet(row.wallet)) {
      applyWallet = String(prev.wallet)
    } else {
      const tsHeader = (opts?.headers?.['x-crew-timestamp'] as string | undefined)?.trim() || ''
      const sigHeader = (opts?.headers?.['x-crew-signature'] as string | undefined)?.trim() || ''
      const decision = decideWalletChange({
        currentWallet: String(prev.wallet),
        newWallet: row.wallet,
        changeSignature: sigHeader || undefined,
        changeTimestamp: tsHeader ? Number(tsHeader) : undefined,
      })
      applyWallet = decision.wallet
      pendingWallet = decision.pendingWallet
      pendingUntil = decision.pendingUntil
    }
  }

  await query(
    `INSERT INTO kol_registrations (
       x_user_id, x_username, x_name, x_verified, followers, following, tweet_count,
       listed_count, profile_image_url, description, wallet, prior_wallets,
       referral_code, referred_by_code, register_ip, pending_wallet, pending_until,
       evm_wallet, stats_refreshed_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18, now(), now())
     ON CONFLICT (x_user_id) DO UPDATE SET
       x_username = EXCLUDED.x_username,
       x_name = EXCLUDED.x_name,
       x_verified = EXCLUDED.x_verified,
       followers = EXCLUDED.followers,
       following = EXCLUDED.following,
       tweet_count = EXCLUDED.tweet_count,
       listed_count = EXCLUDED.listed_count,
       profile_image_url = EXCLUDED.profile_image_url,
       description = EXCLUDED.description,
       wallet = EXCLUDED.wallet,
       prior_wallets = EXCLUDED.prior_wallets,
       referral_code = COALESCE(kol_registrations.referral_code, EXCLUDED.referral_code),
       referred_by_code = COALESCE(kol_registrations.referred_by_code, EXCLUDED.referred_by_code),
       register_ip = COALESCE(kol_registrations.register_ip, EXCLUDED.register_ip),
       pending_wallet = EXCLUDED.pending_wallet,
       pending_until = EXCLUDED.pending_until,
       evm_wallet = COALESCE(EXCLUDED.evm_wallet, kol_registrations.evm_wallet),
       stats_refreshed_at = now(),
       updated_at = now()`,
    [
      user.id,
      user.username,
      user.name || user.username,
      Boolean(user.verified),
      Number(metrics.followers_count || 0),
      Number(metrics.following_count || 0),
      Number(metrics.tweet_count || 0),
      Number(metrics.listed_count || 0),
      profileImageUrl,
      (user.description || '').slice(0, 280),
      applyWallet,
      priorWallets,
      ownCode,
      referredBy,
      registerIp,
      pendingWallet,
      pendingUntil,
      evmWallet,
    ],
  )

  if (firstReferral && referredBy) {
    try {
      await awardReferralRegisterPoints({
        referrerCode: referredBy,
        referredHandle: user.username,
        referredXUserId: user.id,
        referredFollowers,
      })
    } catch (err) {
      console.warn(
        'referral register points failed',
        err instanceof Error ? err.message : err,
      )
    }
  }

  const saved = await getRegistrationByX(user.id)
  if (!saved) throw new Error('Registration saved but could not be read back.')
  await markOAuthCompleted(row.sid, saved.xUsername)
  return saved
}

export type RegistrationProgress =
  | { status: 'pending' }
  | { status: 'done'; handle: string }
  | { status: 'used' }
  | { status: 'expired' }
  | { status: 'unknown' }

export type RegistrationProgressClassified =
  | RegistrationProgress
  | { status: 'lookup_wallet'; wallet: string }

/** Pure Check classifier — cookie-less progress from the one-time OAuth row. */
export function classifyRegistrationProgress(input: {
  found: boolean
  consumed: boolean
  createdAtMs: number
  completedUsername?: string | null
  wallet?: string | null
  now?: number
}): RegistrationProgressClassified {
  if (!input.found) return { status: 'unknown' }
  const handle = String(input.completedUsername || '')
    .replace(/^@+/, '')
    .trim()
  if (input.consumed) {
    if (handle) return { status: 'done', handle }
    const wallet = String(input.wallet || '')
    if (isPayoutWallet(wallet)) return { status: 'lookup_wallet', wallet }
    return { status: 'used' }
  }
  const now = input.now ?? Date.now()
  if (Number.isFinite(input.createdAtMs) && now - input.createdAtMs > REGISTRATION_OAUTH_TTL_MS) {
    return { status: 'expired' }
  }
  return { status: 'pending' }
}

async function markOAuthCompleted(sid: string, username: string): Promise<void> {
  const handle = username.replace(/^@+/, '').trim()
  if (!sid || !handle) return
  try {
    await query(`UPDATE kol_oauth_states SET completed_username = $2 WHERE state = $1`, [sid, handle])
  } catch {
    /* column may not exist until migrate */
  }
}

/** Cookie-less Check for wallet in-app browsers after X finished in another context. */
export async function getRegistrationProgress(sid: string): Promise<RegistrationProgress> {
  const clean = sid.trim().toLowerCase()
  if (!/^[a-f0-9]{32}$/.test(clean)) return { status: 'unknown' }
  let rows: Array<Record<string, unknown>> = []
  try {
    const out = await query(
      `SELECT wallet, consumed_at, created_at, completed_username FROM kol_oauth_states WHERE state = $1`,
      [clean],
    )
    rows = out.rows as Array<Record<string, unknown>>
  } catch {
    const out = await query(
      `SELECT wallet, consumed_at, created_at FROM kol_oauth_states WHERE state = $1`,
      [clean],
    )
    rows = out.rows as Array<Record<string, unknown>>
  }
  const r = rows[0]
  const createdAtMs =
    r?.created_at instanceof Date
      ? r.created_at.getTime()
      : Date.parse(String(r?.created_at || ''))
  const classified = classifyRegistrationProgress({
    found: Boolean(r),
    consumed: Boolean(r?.consumed_at),
    createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : 0,
    completedUsername: r ? String(r.completed_username || '') : '',
    wallet: r ? String(r.wallet || '') : '',
  })
  if (classified.status === 'lookup_wallet') {
    const profile = await getKolProfileByWallet(classified.wallet)
    const fromWallet = profile?.profile.xUsername?.replace(/^@+/, '').trim()
    if (fromWallet) return { status: 'done', handle: fromWallet }
    return { status: 'used' }
  }
  return classified
}

function mapReg(r: Record<string, unknown>, rank: number): KolRegistration {
  return {
    xUserId: r.x_user_id ? String(r.x_user_id) : undefined,
    xUsername: String(r.x_username),
    xName: String(r.x_name || ''),
    xVerified: Boolean(r.x_verified),
    followers: Number(r.followers || 0),
    following: Number(r.following || 0),
    tweetCount: Number(r.tweet_count || 0),
    listedCount: Number(r.listed_count || 0),
    profileImageUrl: r.profile_image_url ? String(r.profile_image_url) : null,
    description: String(r.description || ''),
    wallet: String(r.wallet),
    evmWallet: r.evm_wallet ? String(r.evm_wallet) : null,
    pendingWallet: r.pending_wallet ? String(r.pending_wallet) : null,
    pendingUntil: r.pending_until ? new Date(String(r.pending_until)).toISOString() : null,
    priorWallets: Array.isArray(r.prior_wallets)
      ? (r.prior_wallets as unknown[]).filter((w): w is string => typeof w === 'string')
      : [],
    referralCode: String(r.referral_code || referralCodeFromUsername(String(r.x_username || ''))),
    referredByCode: r.referred_by_code ? String(r.referred_by_code) : null,
    referralCount: Number(r.referral_count || 0),
    referralPoints: Number(r.referral_points || 0),
    solEarned: Number(r.sol_earned || 0),
    registeredAt: new Date(String(r.registered_at)).toISOString(),
    updatedAt: new Date(String(r.updated_at)).toISOString(),
    statsRefreshedAt: new Date(String(r.stats_refreshed_at)).toISOString(),
    rank,
    telegramUserId: r.telegram_user_id ? String(r.telegram_user_id) : null,
    telegramUsername: r.telegram_username ? String(r.telegram_username) : null,
    telegramChatId: r.telegram_chat_id ? String(r.telegram_chat_id) : null,
    telegramAlerts: Boolean(r.telegram_alerts),
    tgChannel: r.tg_channel ? String(r.tg_channel) : null,
    tgChannelVerified: Boolean(r.tg_channel_verified),
    tgReach: r.tg_reach != null && Number.isFinite(Number(r.tg_reach)) ? Number(r.tg_reach) : null,
    telegramOnly: String(r.x_user_id || '').startsWith('tg:'),
  }
}

/** Rank by SOL earned across linked + prior wallets, then followers. */
const REGISTERED_RANKED_CTE = `
  WITH earned AS (
    SELECT
      kr.*,
      COALESCE((
        SELECT SUM(r.amount_sol)
        FROM remits r
        INNER JOIN coins c ON c.mint = r.mint AND c.fee_share_signature IS NOT NULL
        WHERE r.wallet = kr.wallet
           OR r.wallet = ANY (COALESCE(kr.prior_wallets, '{}'))
      ), 0) AS sol_earned,
      COALESCE((
        SELECT COUNT(*)::int
        FROM kol_registrations kids
        WHERE kids.referred_by_code IS NOT NULL
          AND lower(kids.referred_by_code) = lower(kr.referral_code)
      ), 0) AS referral_count
    FROM kol_registrations kr
  )
  SELECT *,
    rank() OVER (
      ORDER BY
        CASE
          WHEN x_user_id LIKE 'tg:%'
           AND COALESCE(x_verified, false) = false
           AND COALESCE(tg_channel_verified, false) = false
          THEN 1 ELSE 0
        END ASC,
        sol_earned DESC,
        followers DESC,
        registered_at ASC
    ) AS board_rank
  FROM earned
`

export type ReferralCut = {
  /** lowercase handle without @ */
  handle: string
  wallet: string
  referrerWallet: string
  referrerHandle: string
  referrerCode: string
}

function referralEventId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`
}

async function creditReferrerPoints(
  referrerCode: string,
  points: number,
): Promise<void> {
  const code = normalizeReferralCode(referrerCode)
  if (!code || points <= 0) return
  await query(
    `UPDATE kol_registrations
     SET referral_points = referral_points + $2, updated_at = now()
     WHERE lower(referral_code) = $1`,
    [code, points],
  )
}

/** Award register points once when a KOL joins with a referral code. */
export async function awardReferralRegisterPoints(opts: {
  referrerCode: string
  referredHandle: string
  referredXUserId: string
  referredFollowers: number
}): Promise<boolean> {
  const referrerCode = normalizeReferralCode(opts.referrerCode)
  const handle = opts.referredHandle.replace(/^@+/, '').toLowerCase()
  const xUserId = opts.referredXUserId.trim()
  if (!referrerCode || !handle || !xUserId) return false
  // Sybil brake: tiny / brand-new X accounts do not mint airdrop weight.
  if (Number(opts.referredFollowers || 0) < REFERRAL_POINTS_MIN_FOLLOWERS) return false

  const dayCount = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM kol_referral_events
     WHERE event_type = 'register'
       AND lower(referrer_code) = $1
       AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')`,
    [referrerCode],
  )
  if (Number(dayCount.rows[0]?.n || 0) >= REFERRAL_POINTS_REGISTER_DAILY_CAP) {
    return false
  }

  const { rows } = await query(
    `INSERT INTO kol_referral_events (
       id, event_type, referrer_code, referred_handle, referred_x_user_id, points
     ) VALUES ($1, 'register', $2, $3, $4, $5)
     ON CONFLICT (referred_x_user_id)
       WHERE event_type = 'register' AND referred_x_user_id IS NOT NULL
     DO NOTHING
     RETURNING id`,
    [
      referralEventId('refreg'),
      referrerCode,
      handle,
      xUserId,
      REFERRAL_POINTS_REGISTER,
    ],
  )
  if (!rows.length) return false
  await creditReferrerPoints(referrerCode, REFERRAL_POINTS_REGISTER)
  return true
}

/** Award hire points once per mint × referred KOL when fee-shares lock. */
export async function awardReferralHirePointsForCrew(
  mint: string,
  handles: string[],
): Promise<number> {
  const mintStr = mint.trim()
  if (!mintStr || mintStr.length < 32) return 0
  let cuts: ReferralCut[]
  try {
    cuts = await lookupReferralCuts(handles)
  } catch {
    return 0
  }
  let awarded = 0
  for (const cut of cuts) {
    const handle = cut.handle.replace(/^@+/, '').toLowerCase()
    const referrerCode = normalizeReferralCode(cut.referrerCode)
    if (!handle || !referrerCode) continue
    const { rows } = await query(
      `INSERT INTO kol_referral_events (
         id, event_type, referrer_code, referred_handle, points, mint
       ) VALUES ($1, 'hire', $2, $3, $4, $5)
       ON CONFLICT (mint, lower(referred_handle))
         WHERE event_type = 'hire' AND mint IS NOT NULL
       DO NOTHING
       RETURNING id`,
      [
        referralEventId('refhire'),
        referrerCode,
        handle,
        REFERRAL_POINTS_HIRE,
        mintStr,
      ],
    )
    if (!rows.length) continue
    await creditReferrerPoints(referrerCode, REFERRAL_POINTS_HIRE)
    awarded += 1
  }
  return awarded
}

/** Lookup direct referrers for hired crew handles (for fee-share splits). */
export async function lookupReferralCuts(
  handles: string[],
): Promise<ReferralCut[]> {
  const normalized = [
    ...new Set(
      handles
        .map((h) => h.replace(/^@+/, '').toLowerCase())
        .filter((h) => /^[a-z0-9_]{1,15}$/.test(h)),
    ),
  ]
  if (!normalized.length) return []
  const { rows } = await query<{
    x_username: string
    wallet: string
    referred_by_code: string
    ref_wallet: string
    ref_username: string
    ref_code: string
  }>(
    `SELECT
       kr.x_username,
       kr.wallet,
       kr.referred_by_code,
       ref.wallet AS ref_wallet,
       ref.x_username AS ref_username,
       ref.referral_code AS ref_code
     FROM kol_registrations kr
     JOIN kol_registrations ref
       ON lower(ref.referral_code) = lower(kr.referred_by_code)
     WHERE lower(kr.x_username) = ANY ($1::text[])
       AND kr.referred_by_code IS NOT NULL
       AND ref.wallet IS NOT NULL
       AND length(trim(ref.wallet)) >= 32
       AND ref.wallet <> kr.wallet`,
    [normalized],
  )
  return rows.map((row) => ({
    handle: String(row.x_username).replace(/^@+/, '').toLowerCase(),
    wallet: String(row.wallet),
    referrerWallet: String(row.ref_wallet),
    referrerHandle: String(row.ref_username).replace(/^@+/, ''),
    referrerCode: String(row.ref_code),
  }))
}

async function getRegistrationByX(xUserId: string): Promise<KolRegistration | null> {
  const { rows } = await query(
    `SELECT * FROM (${REGISTERED_RANKED_CTE}) ranked WHERE x_user_id = $1`,
    [xUserId],
  )
  const row = rows[0] as Record<string, unknown> | undefined
  if (!row) return null
  return mapReg(row, Number(row.board_rank || 0))
}

export async function listRegistered(limit = 50): Promise<{
  leaderboard: KolRegistration[]
  tape: KolRegistration[]
  total: number
  rankedBy: 'sol_earned'
}> {
  const safe = Math.min(100, Math.max(1, limit))
  const [{ rows: board }, { rows: tape }, { rows: countRows }] = await Promise.all([
    query(`SELECT * FROM (${REGISTERED_RANKED_CTE}) ranked ORDER BY board_rank ASC LIMIT $1`, [
      safe,
    ]),
    query(
      `SELECT * FROM (${REGISTERED_RANKED_CTE}) ranked ORDER BY registered_at DESC LIMIT $1`,
      [safe],
    ),
    query<{ n: string }>(`SELECT count(*)::text AS n FROM kol_registrations`),
  ])
  const house = houseHandles()
  const leaderboard = board
    .map((raw) => {
      const row = raw as Record<string, unknown>
      return mapReg(row, Number(row.board_rank || 0))
    })
    .filter((r) => !isHouseHandle(r.xUsername, house))
    .map((r, i) => ({ ...r, rank: i + 1 }))
  const tapeOut = tape
    .map((raw) => {
      const row = raw as Record<string, unknown>
      return mapReg(row, Number(row.board_rank || 0))
    })
    .filter((r) => !isHouseHandle(r.xUsername, house))
  const houseRegistered = board.filter((raw) =>
    isHouseHandle(String((raw as Record<string, unknown>).x_username || ''), house),
  ).length
  return {
    leaderboard,
    tape: tapeOut,
    // Public count excludes house accounts (e.g. @CrewPayHQ).
    total: Math.max(0, Number(countRows[0]?.n || 0) - houseRegistered),
    rankedBy: 'sol_earned',
  }
}

export type KolDeskCoin = {
  mint: string
  ticker: string
  name: string
  mode: string
  launchedAt: string
  pumpUrl: string
  signature: string
  share: number | null
  hireRole: string | null
  seatHandle: string | null
  solReceived: number
  launchedByKol: boolean
}

export type KolDeskRemit = {
  mint: string
  ticker: string
  amountSol: number
  mode: string
  at: string
  signature: string
  handle: string
}

export type KolPerformance = {
  coinsHired: number
  coinsLaunched: number
  solReceived: number
  remitCount: number
  coins: KolDeskCoin[]
  remits: KolDeskRemit[]
}

export type KolProfile = {
  profile: KolRegistration
  performance: KolPerformance
}

const X_HANDLE = /^[A-Za-z0-9_]{1,15}$/

function num(value: unknown): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

function mapCoin(
  row: Record<string, unknown>,
  wallet: string,
  seat: boolean,
): KolDeskCoin {
  return {
    mint: String(row.mint),
    ticker: String(row.ticker),
    name: String(row.name),
    mode: String(row.mode),
    launchedAt: new Date(String(row.launched_at)).toISOString(),
    pumpUrl: String(row.pump_url || ''),
    signature: String(row.signature || ''),
    share: seat ? num(row.share) : null,
    hireRole: seat && row.hire_role ? String(row.hire_role) : null,
    seatHandle: seat && row.handle ? String(row.handle) : null,
    solReceived: num(row.sol_received),
    launchedByKol: String(row.launcher || '') === wallet,
  }
}

async function loadPerformance(wallets: string[]): Promise<KolPerformance> {
  const addrs = [...new Set(wallets.filter((w) => w.length >= 32))]
  if (!addrs.length) {
    return {
      coinsHired: 0,
      coinsLaunched: 0,
      solReceived: 0,
      remitCount: 0,
      coins: [],
      remits: [],
    }
  }
  const primary = addrs[0]!
  const [crew, launchedOnly, totals, remits] = await Promise.all([
    query(
      `SELECT DISTINCT ON (c.mint)
              c.mint, c.ticker, c.name, c.mode, c.launched_at, c.pump_url, c.signature, c.launcher,
              cc.share, cc.hire_role, cc.handle, cc.wallet AS seat_wallet,
              COALESCE((
                SELECT SUM(amount_sol) FROM remits r
                WHERE r.mint = c.mint AND r.wallet = ANY ($1::text[])
              ), 0)::text AS sol_received
       FROM coin_crew cc
       JOIN coins c ON c.mint = cc.mint
       WHERE cc.wallet = ANY ($1::text[])
       ORDER BY c.mint, c.launched_at DESC`,
      [addrs],
    ),
    query(
      `SELECT c.mint, c.ticker, c.name, c.mode, c.launched_at, c.pump_url, c.signature, c.launcher,
              COALESCE((
                SELECT SUM(amount_sol) FROM remits r
                WHERE r.mint = c.mint AND r.wallet = ANY ($1::text[])
              ), 0)::text AS sol_received
       FROM coins c
       WHERE c.launcher = ANY ($1::text[])
         AND NOT EXISTS (
           SELECT 1 FROM coin_crew cc WHERE cc.mint = c.mint AND cc.wallet = ANY ($1::text[])
         )
       ORDER BY c.launched_at DESC`,
      [addrs],
    ),
    query<{ sol: string; n: string }>(
      `SELECT COALESCE(SUM(amount_sol), 0)::text AS sol, COUNT(*)::text AS n
       FROM remits WHERE wallet = ANY ($1::text[])`,
      [addrs],
    ),
    query(
      `SELECT mint, ticker, amount_sol, mode, at, signature, handle
       FROM remits WHERE wallet = ANY ($1::text[])
       ORDER BY at DESC LIMIT 12`,
      [addrs],
    ),
  ])

  const coins = [
    ...crew.rows.map((raw) => mapCoin(raw as Record<string, unknown>, primary, true)),
    ...launchedOnly.rows.map((raw) => mapCoin(raw as Record<string, unknown>, primary, false)),
  ].sort((a, b) => Date.parse(b.launchedAt) - Date.parse(a.launchedAt))

  return {
    coinsHired: crew.rows.length,
    coinsLaunched: coins.filter((coin) => coin.launchedByKol).length,
    solReceived: num(totals.rows[0]?.sol),
    remitCount: num(totals.rows[0]?.n),
    coins,
    remits: remits.rows.map((raw) => {
      const row = raw as Record<string, unknown>
      return {
        mint: String(row.mint),
        ticker: String(row.ticker),
        amountSol: num(row.amount_sol),
        mode: String(row.mode),
        at: new Date(String(row.at)).toISOString(),
        signature: String(row.signature || ''),
        handle: String(row.handle || ''),
      }
    }),
  }
}

async function profileFromUsername(username: string): Promise<KolProfile | null> {
  const handle = username.trim().replace(/^@/, '')
  if (!X_HANDLE.test(handle)) return null
  const { rows } = await query(
    `SELECT * FROM (${REGISTERED_RANKED_CTE}) ranked
     WHERE lower(x_username) = lower($1)`,
    [handle],
  )
  const row = rows[0] as Record<string, unknown> | undefined
  if (!row) return null
  const profile = await ensureDeskAvatar(mapReg(row, Number(row.board_rank || 0)))
  const performance = await loadPerformance(
    walletsForRow(profile.wallet, profile.priorWallets),
  )
  return { profile, performance }
}

export type ClaimPitch = {
  handle: string
  solEarned: number
  remitCount: number
  directoryWallet: string | null
  registered: boolean
  deskPath: string | null
  registerPath: string
  pitch: string
}

/** Past payouts → “You've earned X SOL, claim your page”. */
export async function getClaimPitch(username: string): Promise<ClaimPitch | null> {
  const handle = username.trim().replace(/^@/, '')
  if (!X_HANDLE.test(handle)) return null
  const registered = await profileFromUsername(handle)
  const directoryWallet = directoryWalletForHandle(handle)
  const wallets = new Set<string>()
  if (directoryWallet) wallets.add(directoryWallet)
  if (registered) {
    for (const w of walletsForRow(registered.profile.wallet, registered.profile.priorWallets)) {
      wallets.add(w)
    }
  }
  const addrs = [...wallets]
  let solEarned = registered?.performance.solReceived ?? 0
  let remitCount = registered?.performance.remitCount ?? 0
  if (!registered && addrs.length) {
    const { rows } = await query<{ sol: string; n: string }>(
      `SELECT COALESCE(SUM(amount_sol), 0)::text AS sol, COUNT(*)::text AS n
       FROM remits WHERE wallet = ANY ($1::text[])`,
      [addrs],
    )
    solEarned = num(rows[0]?.sol)
    remitCount = num(rows[0]?.n)
  }
  if (solEarned <= 0 && !registered) return null
  const solText = solEarned >= 1 ? solEarned.toFixed(3) : solEarned.toFixed(4)
  return {
    handle,
    solEarned,
    remitCount,
    directoryWallet,
    registered: Boolean(registered),
    deskPath: registered ? `/kol/${handle}` : null,
    registerPath: '/register',
    pitch: registered
      ? `You've earned ${solText} SOL on CrewPay. Your desk is live.`
      : `You've earned ${solText} SOL on CrewPay. Claim your page — register with X. No crypto needed.`,
  }
}

export async function getKolProfile(username: string): Promise<KolProfile | null> {
  return profileFromUsername(username)
}

export async function getKolProfileByWallet(wallet: string): Promise<KolProfile | null> {
  const address = wallet.trim()
  if (!isPayoutWallet(address)) return null
  const { rows } = await query<{ x_username: string }>(
    `SELECT x_username FROM kol_registrations WHERE wallet = $1`,
    [address],
  )
  const name = rows[0]?.x_username
  if (!name) return null
  return profileFromUsername(name)
}

export async function getKolProfileByXUserId(xUserId: string): Promise<KolProfile | null> {
  const id = xUserId.trim()
  if (!id) return null
  const { rows } = await query<{ x_username: string }>(
    `SELECT x_username FROM kol_registrations WHERE x_user_id = $1`,
    [id],
  )
  const name = rows[0]?.x_username
  if (!name) return null
  return profileFromUsername(name)
}

export function buildWalletSetMessage(wallet: string, timestamp: number): string {
  return `crew-kol-wallet-set:${wallet}:${timestamp}`
}

/** First-time payout wallet, or a later change from Desk. Never writes an empty address. */
export async function updateKolPayoutWallet(opts: {
  xUsername: string
  newWallet: string
  newWalletSignature?: string
  newWalletTimestamp?: number
  changeSignature?: string
  changeTimestamp?: number
}): Promise<KolProfile> {
  const handle = opts.xUsername.trim().replace(/^@+/, '')
  if (!X_HANDLE.test(handle)) throw new Error('Invalid X handle.')
  if (!isPayoutWallet(opts.newWallet)) {
    throw new Error('Invalid Solana payout wallet.')
  }
  const newWallet = new PublicKey(opts.newWallet.trim()).toBase58()
  const existing = await profileFromUsername(handle)
  if (!existing) throw new Error('Wallet is not a registered KOL — complete /register first.')

  const conflict = await query<{ x_username: string }>(
    `SELECT x_username FROM kol_registrations
     WHERE wallet = $1 AND lower(x_username) <> lower($2) LIMIT 1`,
    [newWallet, handle],
  )
  if (conflict.rows.length) {
    throw new Error(walletLinkedElsewhereError(String(conflict.rows[0]!.x_username || 'that account')))
  }

  const currentWallet = existing.profile.wallet
  const now = Date.now()
  const ts = Number(opts.newWalletTimestamp)
  const freshSet = Number.isFinite(ts) && Math.abs(now - ts) <= WALLET_CHANGE_SIG_TTL_MS
  const ownsNew =
    freshSet &&
    Boolean(opts.newWalletSignature) &&
    verifyWalletSignature({
      wallet: newWallet,
      message: buildWalletSetMessage(newWallet, ts),
      signatureBase58: String(opts.newWalletSignature),
    })
  if (!ownsNew) {
    throw new Error('Sign crew-kol-wallet-set with the new Solana wallet to prove you own it.')
  }

  const decision = decideWalletChange({
    currentWallet,
    newWallet,
    changeSignature: opts.changeSignature,
    changeTimestamp: opts.changeTimestamp,
    nowMs: now,
  })

  const prior = new Set(existing.profile.priorWallets)
  if (isPayoutWallet(currentWallet) && currentWallet !== decision.wallet) {
    prior.add(currentWallet)
  }
  const priorWallets = [...prior].filter((w) => w !== decision.wallet)

  await query(
    `UPDATE kol_registrations
     SET wallet = $1,
         prior_wallets = $2,
         pending_wallet = $3,
         pending_until = $4,
         updated_at = now()
     WHERE lower(x_username) = lower($5)`,
    [
      decision.wallet,
      priorWallets,
      decision.pendingWallet,
      decision.pendingUntil,
      handle,
    ],
  )
  const profile = await profileFromUsername(handle)
  if (!profile) throw new Error('Could not read the updated desk.')
  return profile
}

/** Owner-signed update of the optional Base / EVM payout address. */
export async function updateKolEvmWallet(
  solanaWallet: string,
  evmWallet: string | null,
): Promise<KolProfile> {
  const address = solanaWallet.trim()
  if (address.length < 32 || address.length > 64) {
    throw new Error('Invalid Solana wallet.')
  }
  let stored: string | null = null
  if (evmWallet && evmWallet.trim()) {
    stored = assertEvmAddress(evmWallet.trim(), 'evmWallet')
  }
  const { rowCount } = await query(
    `UPDATE kol_registrations SET evm_wallet = $1, updated_at = now() WHERE wallet = $2`,
    [stored, address],
  )
  if (!rowCount) {
    throw new Error('Wallet is not a registered KOL — complete /register first.')
  }
  const profile = await getKolProfileByWallet(address)
  if (!profile) throw new Error('Could not read the updated desk.')
  return profile
}
