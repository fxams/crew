import { getXJsonCache, setXJsonCache } from './x-cache.js'

export type PublicXUser = {
  id: string
  username: string
  name: string
  profileImageUrl: string | null
  followers: number
  following: number
  tweetCount: number
  createdAt: string | null
  verified: boolean
}

function bearerToken(): string | null {
  const t = (process.env.X_BEARER_TOKEN || process.env.X_API_BEARER_TOKEN || '').trim()
  return t || null
}

/** Public user lookup by handle — cached 24h. Returns null if API unavailable. */
export async function fetchPublicXUserByHandle(handle: string): Promise<PublicXUser | null> {
  const username = handle.replace(/^@+/, '').trim()
  if (!username || username.length > 15) return null

  const cacheKey = `xuser:handle:${username.toLowerCase()}`
  const cached = await getXJsonCache<PublicXUser>(cacheKey)
  if (cached?.username) return cached

  const token = bearerToken()
  if (!token) return null

  const url = new URL(`https://api.x.com/2/users/by/username/${encodeURIComponent(username)}`)
  url.searchParams.set(
    'user.fields',
    'created_at,description,profile_image_url,public_metrics,verified',
  )

  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
  const json = (await res.json()) as {
    data?: {
      id: string
      username: string
      name?: string
      profile_image_url?: string
      created_at?: string
      verified?: boolean
      public_metrics?: {
        followers_count?: number
        following_count?: number
        tweet_count?: number
      }
    }
    errors?: Array<{ detail?: string }>
  }
  if (!res.ok || !json.data?.id) {
    return null
  }
  const m = json.data.public_metrics || {}
  const out: PublicXUser = {
    id: json.data.id,
    username: json.data.username,
    name: json.data.name || json.data.username,
    profileImageUrl: json.data.profile_image_url || null,
    followers: Number(m.followers_count || 0),
    following: Number(m.following_count || 0),
    tweetCount: Number(m.tweet_count || 0),
    createdAt: json.data.created_at || null,
    verified: Boolean(json.data.verified),
  }
  await setXJsonCache(cacheKey, out)
  return out
}
