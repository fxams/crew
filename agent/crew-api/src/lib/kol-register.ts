/**
 * Opt-in KOL registration: prove a Solana wallet, then sign in with X and store public stats.
 */

import { createHash, randomBytes } from 'node:crypto'
import { PublicKey } from '@solana/web3.js'
import bs58 from 'bs58'
import nacl from 'tweetnacl'
import { KOL_DB } from './agent/narrative.js'
import { query } from './db.js'

export const REGISTER_MESSAGE_PREFIX = 'CrewPay KOL registration'

/** Direct referral cut advertised on site / locked into fee-shares when referred KOLs are hired. */
export const KOL_REFERRAL_CUT_PCT = 5
/** Points awarded when someone registers with your code (future CREW airdrop weight). */
export const REFERRAL_POINTS_REGISTER = 100
/** Points awarded when a referred KOL is hired and fee-shares lock. */
export const REFERRAL_POINTS_HIRE = 250
/** Referred account must have at least this many X followers to earn register points. */
export const REFERRAL_POINTS_MIN_FOLLOWERS = 50
/** Max register-point awards credited to one referrer code per UTC day (sybil brake). */
export const REFERRAL_POINTS_REGISTER_DAILY_CAP = 10

export type KolRegistration = {
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
  wallet: string
  message: string
  signature: string
  referralCode?: string
}): Promise<{ authorizeUrl: string }> {
  if (!xOAuthConfigured()) {
    throw new Error('X sign-in is not configured. Set X_CLIENT_ID and X_CLIENT_SECRET on crewpay-api.')
  }
  const wallet = opts.wallet.trim()
  const expectedPrefix = `${REGISTER_MESSAGE_PREFIX}\nWallet: ${wallet}\nNonce: `
  if (!opts.message.startsWith(expectedPrefix)) {
    throw new Error('Registration message does not match this wallet.')
  }
  const nonce = opts.message.slice(expectedPrefix.length).trim()
  if (!/^[a-f0-9]{32}$/.test(nonce)) throw new Error('Invalid registration nonce.')
  if (!verifyWalletLink(wallet, opts.message, opts.signature)) {
    throw new Error('Wallet signature did not verify. Sign with the linked Solana wallet.')
  }

  const { rows } = await query(`DELETE FROM kol_oauth_nonces WHERE nonce = $1 AND wallet = $2 RETURNING nonce`, [
    nonce,
    wallet,
  ])
  if (!rows.length) throw new Error('Registration nonce expired or already used. Start again.')

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
    if (found.rows[0].wallet === wallet) {
      throw new Error('You cannot use your own referral code.')
    }
    referralCode = String(found.rows[0].referral_code)
  }

  await query(`DELETE FROM kol_oauth_states WHERE created_at < now() - interval '15 minutes'`)
  const state = randomBytes(16).toString('hex')
  const codeVerifier = b64url(randomBytes(32))
  await query(
    `INSERT INTO kol_oauth_states (state, code_verifier, wallet, referral_code) VALUES ($1, $2, $3, $4)`,
    [state, codeVerifier, wallet, referralCode],
  )
  return { authorizeUrl: buildXAuthorizeUrl({ state, codeVerifier }) }
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

export async function completeXCallback(code: string, state: string): Promise<KolRegistration> {
  const { rows } = await query(
    `DELETE FROM kol_oauth_states WHERE state = $1 RETURNING code_verifier, wallet, referral_code`,
    [state],
  )
  const row = rows[0] as {
    code_verifier?: string
    wallet?: string
    referral_code?: string | null
  } | undefined
  if (!row?.code_verifier || !row.wallet) {
    throw new Error('Sign-in session expired. Connect your wallet and try again.')
  }

  const accessToken = await exchangeCode(code, row.code_verifier)
  const user = await fetchXMe(accessToken)
  let profileImageUrl = user.profile_image_url || null
  if (isDefaultXProfileImage(profileImageUrl)) {
    profileImageUrl = (await fetchPublicXAvatarUrl(user.username)) || profileImageUrl
  }
  const metrics = user.public_metrics || {}

  const conflict = await query(
    `SELECT x_user_id FROM kol_registrations WHERE wallet = $1 AND x_user_id <> $2 LIMIT 1`,
    [row.wallet, user.id],
  )
  if (conflict.rows.length) {
    throw new Error('This Solana wallet is already linked to a different X account.')
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
  if (!referredBy && row.referral_code) {
    const ref = normalizeReferralCode(row.referral_code)
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
        referrer.wallet !== row.wallet &&
        !prior.has(referrer.wallet)
      ) {
        referredBy = String(referrer.referral_code)
      }
    }
  }

  const firstReferral = !prev?.referred_by_code && Boolean(referredBy)
  const referredFollowers = Number(metrics.followers_count || 0)
  await query(
    `INSERT INTO kol_registrations (
       x_user_id, x_username, x_name, x_verified, followers, following, tweet_count,
       listed_count, profile_image_url, description, wallet, prior_wallets,
       referral_code, referred_by_code,
       stats_refreshed_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now(), now())
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
      row.wallet,
      priorWallets,
      ownCode,
      referredBy,
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
  return saved
}

function mapReg(r: Record<string, unknown>, rank: number): KolRegistration {
  return {
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
    rank() OVER (ORDER BY sol_earned DESC, followers DESC, registered_at ASC) AS board_rank
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
  const leaderboard = board.map((raw) => {
    const row = raw as Record<string, unknown>
    return mapReg(row, Number(row.board_rank || 0))
  })
  const tapeOut = tape.map((raw) => {
    const row = raw as Record<string, unknown>
    return mapReg(row, Number(row.board_rank || 0))
  })
  return {
    leaderboard,
    tape: tapeOut,
    total: Number(countRows[0]?.n || 0),
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
      : `You've earned ${solText} SOL on CrewPay. Claim your page — register with X + your Solana wallet.`,
  }
}

export async function getKolProfile(username: string): Promise<KolProfile | null> {
  return profileFromUsername(username)
}

export async function getKolProfileByWallet(wallet: string): Promise<KolProfile | null> {
  const address = wallet.trim()
  if (address.length < 32 || address.length > 64) return null
  const { rows } = await query<{ x_username: string }>(
    `SELECT x_username FROM kol_registrations WHERE wallet = $1`,
    [address],
  )
  const name = rows[0]?.x_username
  if (!name) return null
  return profileFromUsername(name)
}
