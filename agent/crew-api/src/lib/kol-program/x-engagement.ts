import { CREWPAY_HQ_X_HANDLE } from './flags.js'
import { fetchPublicXUserByHandle } from './x-public-user.js'
import { getXJsonCache, setXJsonCache } from './x-cache.js'

export type VerifyStatus = 'ok' | 'pending' | 'not_found'

type UserPage = {
  data?: Array<{ id?: string; username?: string }>
  meta?: { next_token?: string }
  title?: string
  detail?: string
}

function appBearer(): string | null {
  const t = (process.env.X_BEARER_TOKEN || process.env.X_API_BEARER_TOKEN || '').trim()
  return t || null
}

async function xGet(url: string, token: string): Promise<{ ok: boolean; status: number; json: UserPage }> {
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
  const json = (await res.json().catch(() => ({}))) as UserPage
  return { ok: res.ok, status: res.status, json }
}

function includesUser(page: UserPage, xUserId: string, username?: string): boolean {
  const id = xUserId.toLowerCase()
  const handle = username?.replace(/^@+/, '').toLowerCase()
  return (page.data || []).some(
    (u) =>
      String(u.id || '').toLowerCase() === id ||
      (handle && String(u.username || '').toLowerCase() === handle),
  )
}

export async function verifyFollowingHq(
  accessToken: string,
  xUserId: string,
): Promise<VerifyStatus> {
  const hq = await fetchPublicXUserByHandle(CREWPAY_HQ_X_HANDLE)
  const url = new URL(`https://api.x.com/2/users/${encodeURIComponent(xUserId)}/following`)
  url.searchParams.set('max_results', '1000')
  url.searchParams.set('user.fields', 'username')
  const res = await xGet(url.toString(), accessToken)
  if (!res.ok) return 'pending'
  if (includesUser(res.json, hq?.id || '', CREWPAY_HQ_X_HANDLE)) return 'ok'
  return 'not_found'
}

async function scanTweetUsers(
  path: 'liking_users' | 'retweeted_by',
  tweetId: string,
  xUserId: string,
  accessToken: string | null,
): Promise<VerifyStatus> {
  if (!tweetId) return 'pending'
  const tokens = [accessToken, appBearer()].filter((t, i, a): t is string => Boolean(t) && a.indexOf(t) === i)
  if (!tokens.length) return 'pending'
  let sawAuthError = false
  for (const token of tokens) {
    const url = new URL(`https://api.x.com/2/tweets/${encodeURIComponent(tweetId)}/${path}`)
    url.searchParams.set('max_results', '100')
    url.searchParams.set('user.fields', 'username')
    const res = await xGet(url.toString(), token)
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      sawAuthError = true
      continue
    }
    if (!res.ok) {
      sawAuthError = true
      continue
    }
    if (includesUser(res.json, xUserId)) return 'ok'
    return 'not_found'
  }
  return sawAuthError ? 'pending' : 'not_found'
}

export function verifyFollowingHqFromPage(
  users: Array<{ id?: string; username?: string }>,
  hqUserId: string,
): boolean {
  return includesUser({ data: users }, hqUserId, CREWPAY_HQ_X_HANDLE)
}

export async function verifyLikedTweet(
  tweetId: string,
  xUserId: string,
  accessToken: string | null,
): Promise<VerifyStatus> {
  return scanTweetUsers('liking_users', tweetId, xUserId, accessToken)
}

export async function verifyRepostedTweet(
  tweetId: string,
  xUserId: string,
  accessToken: string | null,
): Promise<VerifyStatus> {
  return scanTweetUsers('retweeted_by', tweetId, xUserId, accessToken)
}

export async function verifyRepliedToConversation(
  accessToken: string,
  handle: string,
  conversationId: string,
): Promise<VerifyStatus> {
  if (!conversationId) return 'pending'
  const url = new URL('https://api.x.com/2/tweets/search/recent')
  url.searchParams.set(
    'query',
    `conversation_id:${conversationId} from:${handle.replace(/^@+/, '')}`,
  )
  url.searchParams.set('max_results', '10')
  const res = await xGet(url.toString(), accessToken)
  if (!res.ok) return 'pending'
  return (res.json.data || []).length > 0 ? 'ok' : 'not_found'
}

export type HqTweet = { id: string; text: string }

export async function latestHqTweet(): Promise<HqTweet | null> {
  const day = new Date().toISOString().slice(0, 10)
  const cacheKey = `hq-latest:${day}`
  const cached = await getXJsonCache<HqTweet>(cacheKey)
  if (cached?.id) return cached

  const hq = await fetchPublicXUserByHandle(CREWPAY_HQ_X_HANDLE)
  const token = appBearer()
  if (!hq?.id || !token) return cached ?? null

  const url = new URL(`https://api.x.com/2/users/${hq.id}/tweets`)
  url.searchParams.set('max_results', '5')
  url.searchParams.set('exclude', 'replies,retweets')
  url.searchParams.set('tweet.fields', 'created_at,conversation_id')
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
  const json = (await res.json().catch(() => ({}))) as {
    data?: Array<{ id: string; text?: string }>
  }
  const tweet = json.data?.[0]
  if (!tweet?.id) return null
  const out = { id: tweet.id, text: tweet.text || '' }
  const msToMidnight =
    Date.UTC(
      Number(day.slice(0, 4)),
      Number(day.slice(5, 7)) - 1,
      Number(day.slice(8, 10)) + 1,
    ) - Date.now()
  await setXJsonCache(cacheKey, out, Math.max(60_000, msToMidnight))
  return out
}

export function utcMidnightCountdown(now = Date.now()): { resetAt: string; label: string } {
  const d = new Date(now)
  const reset = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)
  const ms = Math.max(0, reset - now)
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return { resetAt: new Date(reset).toISOString(), label: `${h}h ${m}m` }
}

export function pendingReason(action: string): string {
  return `Could not verify ${action} on X yet. Marked pending — try again after the action is public.`
}
