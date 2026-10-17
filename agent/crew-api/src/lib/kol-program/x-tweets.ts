import { query } from '../db.js'

const CACHE_TTL_MS = 15 * 60 * 1000

export type CachedTweet = {
  id: string
  text: string
  authorId?: string
  inReplyToUserId?: string
  referencedTweetIds?: string[]
}

async function getCache(key: string): Promise<CachedTweet[] | null> {
  const { rows } = await query<{ body: unknown; expires_at: Date }>(
    `SELECT body, expires_at FROM kol_program_x_cache WHERE cache_key = $1`,
    [key],
  )
  const row = rows[0]
  if (!row) return null
  if (row.expires_at.getTime() < Date.now()) return null
  const body = row.body as { tweets?: CachedTweet[] }
  return body.tweets ?? null
}

async function setCache(key: string, tweets: CachedTweet[]): Promise<void> {
  const expires = new Date(Date.now() + CACHE_TTL_MS)
  await query(
    `INSERT INTO kol_program_x_cache (cache_key, body, expires_at)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (cache_key) DO UPDATE SET body = EXCLUDED.body, expires_at = EXCLUDED.expires_at`,
    [key, JSON.stringify({ tweets }), expires],
  )
}

/** Fetch recent tweets for the authenticated user (Bearer = user token from session exchange). */
export async function fetchRecentUserTweets(
  accessToken: string,
  userId: string,
): Promise<CachedTweet[]> {
  const cacheKey = `tweets:${userId}`
  const cached = await getCache(cacheKey)
  if (cached) return cached

  const url = new URL(`https://api.x.com/2/users/${userId}/tweets`)
  url.searchParams.set('max_results', '10')
  url.searchParams.set(
    'tweet.fields',
    'created_at,author_id,in_reply_to_user_id,referenced_tweets',
  )
  const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } })
  const json = (await res.json()) as {
    data?: Array<{
      id: string
      text: string
      author_id?: string
      in_reply_to_user_id?: string
      referenced_tweets?: Array<{ type: string; id: string }>
    }>
    detail?: string
  }
  if (!res.ok) {
    throw new Error(json.detail || `X tweets HTTP ${res.status}`)
  }
  const tweets: CachedTweet[] = (json.data ?? []).map((t) => ({
    id: t.id,
    text: t.text,
    authorId: t.author_id,
    inReplyToUserId: t.in_reply_to_user_id,
    referencedTweetIds: t.referenced_tweets?.map((r) => r.id),
  }))
  await setCache(cacheKey, tweets)
  return tweets
}
