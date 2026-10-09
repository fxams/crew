/**
 * Opt-in KOL registration: prove a Solana wallet, then sign in with X and store public stats.
 */

import { createHash, randomBytes } from 'node:crypto'
import { PublicKey } from '@solana/web3.js'
import bs58 from 'bs58'
import nacl from 'tweetnacl'
import { query } from './db.js'

export const REGISTER_MESSAGE_PREFIX = 'CrewPay KOL registration'

export type KolRegistration = {
  xUserId: string
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
  registeredAt: string
  updatedAt: string
  statsRefreshedAt: string
  rank: number
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

export type OAuthReturn = 'phantom' | 'web'

export function asOAuthReturn(value: unknown): OAuthReturn {
  return value === 'phantom' ? 'phantom' : 'web'
}

/** Opens `target` inside Phantom's in-app browser. Requires a user tap on mobile. */
export function phantomBrowseUrl(target: string): string {
  const ref = siteUrl()
  return `https://phantom.com/ul/browse/${encodeURIComponent(target)}?ref=${encodeURIComponent(ref)}`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Page X redirects to after OAuth when the user started inside Phantom mobile. */
export function phantomReturnPage(opts: { heading: string; detail: string; nextPath: string }): string {
  const next = `${siteUrl()}${opts.nextPath.startsWith('/') ? opts.nextPath : `/${opts.nextPath}`}`
  const open = phantomBrowseUrl(next)
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Back to CrewPay</title>
<body style="font-family:system-ui,sans-serif;background:#0c0c0c;color:#f4f4f4;margin:0;padding:32px 20px">
  <main style="max-width:28rem;margin:0 auto">
    <h1 style="font-size:1.4rem">${escapeHtml(opts.heading)}</h1>
    <p style="line-height:1.45">${escapeHtml(opts.detail)}</p>
    <p><a href="${escapeHtml(open)}" style="display:inline-block;background:#ab9ff2;color:#111;text-decoration:none;font-weight:700;padding:12px 16px;border-radius:10px">Open in Phantom</a></p>
    <p style="color:#aaa;font-size:.9rem">This tap is required. iPhone and Android only switch back into Phantom when you tap the link.</p>
  </main>
</body>
</html>`
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

/** X returns this when the developer app is still a Standalone App, not inside a Project. */
export function explainXError(raw: string): string {
  if (/attached to a Project/i.test(raw) || /client-not-enrolled/i.test(raw)) {
    return 'X blocked this app because it is not inside a Project. In the X developer portal, move the app out of Standalone Apps and into a Project, then register again.'
  }
  return raw
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
  returnTo?: OAuthReturn
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

  await query(`DELETE FROM kol_oauth_states WHERE created_at < now() - interval '15 minutes'`)
  const state = randomBytes(16).toString('hex')
  const codeVerifier = b64url(randomBytes(32))
  const returnTo = asOAuthReturn(opts.returnTo)
  await query(
    `INSERT INTO kol_oauth_states (state, code_verifier, wallet, return_to) VALUES ($1, $2, $3, $4)`,
    [state, codeVerifier, wallet, returnTo],
  )
  return { authorizeUrl: buildXAuthorizeUrl({ state, codeVerifier }) }
}

export async function oauthReturnForState(state: string): Promise<OAuthReturn> {
  if (!state) return 'web'
  const { rows } = await query(`SELECT return_to FROM kol_oauth_states WHERE state = $1`, [state])
  return asOAuthReturn((rows[0] as { return_to?: string } | undefined)?.return_to)
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
    throw new Error(explainXError(json.error_description || json.error || `X token HTTP ${res.status}`))
  }
  return json.access_token
}

async function fetchXMe(accessToken: string): Promise<XUser> {
  const url = new URL('https://api.x.com/2/users/me')
  url.searchParams.set('user.fields', 'public_metrics,description,verified,profile_image_url')
  const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } })
  const json = (await res.json()) as { data?: XUser; detail?: string; title?: string; reason?: string }
  if (!res.ok || !json.data?.id || !json.data.username) {
    throw new Error(explainXError(json.detail || json.title || `X user HTTP ${res.status}`))
  }
  return json.data
}

export async function completeXCallback(
  code: string,
  state: string,
): Promise<{ registration: KolRegistration; returnTo: OAuthReturn }> {
  const { rows } = await query(
    `DELETE FROM kol_oauth_states WHERE state = $1 RETURNING code_verifier, wallet, return_to`,
    [state],
  )
  const row = rows[0] as { code_verifier?: string; wallet?: string; return_to?: string } | undefined
  if (!row?.code_verifier || !row.wallet) {
    throw new Error('Sign-in session expired. Connect your wallet and try again.')
  }

  const accessToken = await exchangeCode(code, row.code_verifier)
  const user = await fetchXMe(accessToken)
  const metrics = user.public_metrics || {}

  const conflict = await query(
    `SELECT x_user_id FROM kol_registrations WHERE wallet = $1 AND x_user_id <> $2 LIMIT 1`,
    [row.wallet, user.id],
  )
  if (conflict.rows.length) {
    throw new Error('This Solana wallet is already linked to a different X account.')
  }

  await query(
    `INSERT INTO kol_registrations (
       x_user_id, x_username, x_name, x_verified, followers, following, tweet_count,
       listed_count, profile_image_url, description, wallet, stats_refreshed_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now(), now())
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
      user.profile_image_url || null,
      (user.description || '').slice(0, 280),
      row.wallet,
    ],
  )

  const saved = await getRegistrationByX(user.id)
  if (!saved) throw new Error('Registration saved but could not be read back.')
  return { registration: saved, returnTo: asOAuthReturn(row.return_to) }
}

function mapReg(r: Record<string, unknown>, rank: number): KolRegistration {
  return {
    xUserId: String(r.x_user_id),
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
    registeredAt: new Date(String(r.registered_at)).toISOString(),
    updatedAt: new Date(String(r.updated_at)).toISOString(),
    statsRefreshedAt: new Date(String(r.stats_refreshed_at)).toISOString(),
    rank,
  }
}

async function getRegistrationByX(xUserId: string): Promise<KolRegistration | null> {
  const { rows } = await query(
    `SELECT *, rank() OVER (ORDER BY followers DESC, registered_at ASC) AS board_rank
     FROM kol_registrations WHERE x_user_id = $1`,
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
}> {
  const safe = Math.min(100, Math.max(1, limit))
  const ranked = `SELECT *, rank() OVER (ORDER BY followers DESC, registered_at ASC) AS board_rank FROM kol_registrations`
  const [{ rows: board }, { rows: tape }, { rows: countRows }] = await Promise.all([
    query(`SELECT * FROM (${ranked}) ranked ORDER BY board_rank ASC LIMIT $1`, [safe]),
    query(`SELECT * FROM (${ranked}) ranked ORDER BY registered_at DESC LIMIT $1`, [safe]),
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
  }
}
