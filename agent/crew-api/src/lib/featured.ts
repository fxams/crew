/**
 * @CrewPayHQ feature post — stored per coin after an external routine posts.
 * CrewPay never sends the tweet from this codebase.
 */

import { query } from './db.js'
import { getCoin, type ApiCoin } from './coins.js'

const STATUS_RE = /^\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,20})\/?$/

export function featuredXHandle(): string {
  const h = (process.env.CREW_FEATURED_X_HANDLE || 'CrewPayHQ').trim().replace(/^@/, '')
  return h || 'CrewPayHQ'
}

export function featuredXProfileUrl(): string {
  return `https://x.com/${featuredXHandle()}`
}

/** Accept only https x.com / twitter.com status URLs from the configured handle. */
export function parseFeaturedXUrl(raw: string): { url: string; handle: string; statusId: string } {
  const want = featuredXHandle().toLowerCase()
  let parsed: URL
  try {
    parsed = new URL(String(raw || '').trim())
  } catch {
    throw new Error('Featured post must be an https://x.com/<handle>/status/<id> URL')
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Featured post URL must be https')
  }
  const host = parsed.hostname.toLowerCase()
  if (host !== 'x.com' && host !== 'www.x.com' && host !== 'twitter.com' && host !== 'www.twitter.com') {
    throw new Error('Featured post must be on x.com')
  }
  const m = parsed.pathname.match(STATUS_RE)
  if (!m) throw new Error('Featured post must be a status URL (x.com/<handle>/status/<id>)')
  const handle = m[1]!
  const statusId = m[2]!
  if (handle.toLowerCase() !== want) {
    throw new Error(`Featured post must be from @${featuredXHandle()}`)
  }
  return {
    url: `https://x.com/${handle}/status/${statusId}`,
    handle,
    statusId,
  }
}

export async function setCoinFeaturedX(opts: {
  mint: string
  url: string
  setBy: string
  requireGraduated?: boolean
}): Promise<ApiCoin> {
  const coin = await getCoin(opts.mint)
  if (!coin) throw new Error('Not found')
  if (opts.requireGraduated !== false && !coin.graduatedAt) {
    throw new Error('Featured post unlocks after graduation — coin is not marked graduated yet')
  }
  const parsed = parseFeaturedXUrl(opts.url)
  const now = Date.now()
  await query(
    `UPDATE coins
     SET featured_x_url = $2,
         featured_x_at = to_timestamp($3/1000.0),
         featured_x_set_by = $4,
         updated_at = now()
     WHERE mint = $1`,
    [coin.mint, parsed.url, now, opts.setBy.slice(0, 80)],
  )
  const saved = await getCoin(coin.mint)
  if (!saved) throw new Error('Failed to save featured URL')
  return saved
}

export async function listGraduatedUnfeatured(limit = 50): Promise<ApiCoin[]> {
  const safe = Math.min(100, Math.max(1, Number(limit) || 50))
  const { rows } = await query(
    `SELECT mint FROM coins
     WHERE graduated_at IS NOT NULL
       AND (featured_x_url IS NULL OR featured_x_url = '')
     ORDER BY graduated_at ASC
     LIMIT $1`,
    [safe],
  )
  const out: ApiCoin[] = []
  for (const row of rows) {
    const coin = await getCoin(String(row.mint))
    if (coin) out.push(coin)
  }
  return out
}

export function featuredPublic(coin: Pick<ApiCoin, 'featuredXUrl' | 'featuredXAt'>) {
  const handle = featuredXHandle()
  return {
    handle,
    profileUrl: featuredXProfileUrl(),
    url: coin.featuredXUrl || null,
    at: coin.featuredXAt || null,
    autoPosted: false as const,
    note: `External routine posts from @${handle} after graduation, then sets this URL. CrewPay does not auto-post.`,
  }
}
