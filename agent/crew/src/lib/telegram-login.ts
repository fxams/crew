export type TelegramWidgetAuth = {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

export const TELEGRAM_BOT_USERNAME = (
  (typeof import.meta !== 'undefined' &&
    (import.meta.env?.VITE_TELEGRAM_BOT_USERNAME as string | undefined)) ||
  'CrewPay_Bot'
).replace(/^@+/, '')

export const TELEGRAM_BOT_URL = `https://t.me/${TELEGRAM_BOT_USERNAME}`

/** Public numeric bot id. Optional VITE_ — token prefix, never the secret suffix. */
export function telegramBotIdFromEnv(): number | null {
  const raw =
    typeof import.meta !== 'undefined'
      ? (import.meta.env?.VITE_TELEGRAM_BOT_ID as string | undefined)
      : undefined
  const id = Number(raw)
  return Number.isFinite(id) && id > 0 ? id : null
}

export const TELEGRAM_AUTH_QUERY_KEYS = [
  'id',
  'first_name',
  'last_name',
  'username',
  'photo_url',
  'auth_date',
  'hash',
] as const

export function telegramWidgetScriptSrc(): string {
  return 'https://telegram.org/js/telegram-widget.js?22'
}

/** Official iframe only on real desktop browsers — never mobile / in-app WebViews. */
export function allowTelegramWidgetIframe(ua?: string | null): boolean {
  const s = String(ua || '')
  if (!s) return false
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(s)) return false
  if (/Phantom|Solflare|Backpack|WebView|Instagram|FBAN|FBAV/i.test(s)) return false
  return true
}

export function isTelegramWidgetAuth(value: unknown): value is TelegramWidgetAuth {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    Number(v.id) > 0 &&
    typeof v.first_name === 'string' &&
    typeof v.hash === 'string' &&
    Number(v.auth_date) > 0
  )
}

/** Full-page Login Widget fallback — works when the iframe is blocked (CSP / in-app browsers). */
export function telegramOauthUrl(opts: {
  botId?: number | null
  origin: string
  returnTo: string
}): string {
  const url = new URL('https://oauth.telegram.org/auth')
  if (opts.botId && opts.botId > 0) url.searchParams.set('bot_id', String(opts.botId))
  url.searchParams.set('origin', opts.origin)
  url.searchParams.set('request_access', 'write')
  url.searchParams.set('return_to', opts.returnTo)
  url.searchParams.set('embed', '0')
  return url.toString()
}

export function telegramAuthFromSearchParams(
  params: URLSearchParams | { get(name: string): string | null },
): TelegramWidgetAuth | null {
  const id = Number(params.get('id'))
  const first_name = params.get('first_name') || ''
  const hash = params.get('hash') || ''
  const auth_date = Number(params.get('auth_date'))
  const raw = {
    id,
    first_name,
    last_name: params.get('last_name') || undefined,
    username: params.get('username') || undefined,
    photo_url: params.get('photo_url') || undefined,
    auth_date,
    hash,
  }
  return isTelegramWidgetAuth(raw) ? raw : null
}

function telegramAuthFromUnknown(value: unknown): TelegramWidgetAuth | null {
  if (!isTelegramWidgetAuth(value)) return null
  return {
    ...value,
    id: Number(value.id),
    auth_date: Number(value.auth_date),
  }
}

function telegramAuthFromPacked(packed: string): TelegramWidgetAuth | null {
  const tries = [packed]
  try {
    tries.push(decodeURIComponent(packed))
  } catch {
    /* already decoded */
  }
  for (const text of tries) {
    try {
      const parsed = telegramAuthFromUnknown(JSON.parse(text) as unknown)
      if (parsed) return parsed
    } catch {
      /* next */
    }
  }
  return null
}

/** Query params or `#tgAuthResult=` / hash query — oauth.telegram.org return shapes. */
export function telegramAuthFromLocation(
  params: URLSearchParams | { get(name: string): string | null },
  hash?: string,
): TelegramWidgetAuth | null {
  const fromQuery = telegramAuthFromSearchParams(params)
  if (fromQuery) return fromQuery
  const raw = String(hash || '').replace(/^#/, '')
  if (!raw) return null
  if (raw.startsWith('{')) return telegramAuthFromPacked(raw)
  const hashParams = new URLSearchParams(raw)
  const packed = hashParams.get('tgAuthResult')
  if (packed) {
    const fromPacked = telegramAuthFromPacked(packed)
    if (fromPacked) return fromPacked
  }
  return telegramAuthFromSearchParams(hashParams)
}

export function stripTelegramAuthParams(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params)
  for (const key of TELEGRAM_AUTH_QUERY_KEYS) next.delete(key)
  return next
}
