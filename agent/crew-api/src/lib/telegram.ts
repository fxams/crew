/**
 * Telegram Login Widget + Bot API helpers.
 * TELEGRAM_BOT_TOKEN is never logged or returned.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export const TELEGRAM_BOT_USERNAME = (process.env.TELEGRAM_BOT_USERNAME || 'CrewPay_Bot')
  .trim()
  .replace(/^@+/, '') || 'CrewPay_Bot'

export const TELEGRAM_BOT_URL = `https://t.me/${TELEGRAM_BOT_USERNAME}`

export type TelegramWidgetUser = {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

export function telegramBotToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || ''
}

export function telegramWebhookSecret(): string {
  return process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || ''
}

export function telegramConfigured(): boolean {
  return Boolean(telegramBotToken())
}

/** Public numeric bot id (token prefix). Never the secret suffix. */
export function telegramBotId(token = telegramBotToken()): number | null {
  const head = token.split(':')[0] || ''
  const id = Number(head)
  return Number.isFinite(id) && id > 0 ? id : null
}

export function redactTelegramSecret(text: string): string {
  const token = telegramBotToken()
  const secret = telegramWebhookSecret()
  let out = String(text || '')
  if (token) out = out.split(token).join('[redacted]')
  if (secret) out = out.split(secret).join('[redacted]')
  return out
}

/** Official Login Widget check: HMAC-SHA256(SHA256(bot_token), data_check_string). */
export function telegramWidgetCheckString(user: Omit<TelegramWidgetUser, 'hash'>): string {
  const fields: Record<string, string> = {}
  const id = Number(user.id)
  if (Number.isFinite(id) && id > 0) fields.id = String(id)
  if (user.first_name) fields.first_name = String(user.first_name)
  if (user.last_name) fields.last_name = String(user.last_name)
  if (user.username) fields.username = String(user.username)
  if (user.photo_url) fields.photo_url = String(user.photo_url)
  if (user.auth_date != null && user.auth_date !== undefined) {
    fields.auth_date = String(user.auth_date)
  }
  return Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('\n')
}

export function verifyTelegramLoginHash(
  user: TelegramWidgetUser,
  token = telegramBotToken(),
): boolean {
  if (!token || !user?.hash || !/^[0-9a-f]{64}$/i.test(user.hash)) return false
  const secret = createHash('sha256').update(token).digest()
  const mac = createHmac('sha256', secret).update(telegramWidgetCheckString(user)).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(user.hash, 'hex'))
  } catch {
    return false
  }
}

export function verifyTelegramWidget(
  user: TelegramWidgetUser,
  opts?: { token?: string; nowMs?: number; maxAgeSec?: number },
): TelegramWidgetUser {
  const token = opts?.token ?? telegramBotToken()
  if (!token) throw new Error('Telegram login is not configured.')
  const id = Number(user?.id)
  if (!Number.isFinite(id) || id <= 0) throw new Error('Invalid Telegram login.')
  if (!verifyTelegramLoginHash({ ...user, id }, token)) {
    throw new Error('Invalid Telegram login.')
  }
  const authDate = Number(user.auth_date)
  const nowSec = Math.floor((opts?.nowMs ?? Date.now()) / 1000)
  const maxAge = opts?.maxAgeSec ?? 24 * 60 * 60
  if (!Number.isFinite(authDate) || nowSec - authDate > maxAge || authDate > nowSec + 60) {
    throw new Error('Telegram login expired. Try again.')
  }
  return {
    id,
    first_name: String(user.first_name || ''),
    last_name: user.last_name ? String(user.last_name) : undefined,
    username: user.username ? String(user.username).replace(/^@+/, '') : undefined,
    photo_url: user.photo_url ? String(user.photo_url) : undefined,
    auth_date: authDate,
    hash: user.hash,
  }
}

export function checkTelegramWebhookSecret(header: string | undefined): boolean {
  const want = telegramWebhookSecret()
  if (!want) return false
  const got = String(header || '').trim()
  if (!got || got.length !== want.length) return false
  try {
    return timingSafeEqual(Buffer.from(got), Buffer.from(want))
  } catch {
    return false
  }
}

export async function telegramApi(
  method: string,
  body: Record<string, unknown> = {},
): Promise<unknown> {
  const token = telegramBotToken()
  if (!token) throw new Error('Telegram bot is not configured.')
  if (!/^[a-zA-Z]+$/.test(method)) throw new Error('Invalid Telegram method.')
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = (await res.json()) as { ok?: boolean; result?: unknown; description?: string }
  if (!json.ok) {
    throw new Error(redactTelegramSecret(String(json.description || 'Telegram API error')))
  }
  return json.result
}

export async function sendTelegramDm(chatId: string | number, text: string): Promise<boolean> {
  const trimmed = text.trim().slice(0, 3500)
  if (!trimmed) return false
  try {
    await telegramApi('sendMessage', {
      chat_id: chatId,
      text: trimmed,
      disable_web_page_preview: true,
    })
    return true
  } catch {
    return false
  }
}

export async function telegramGetChat(channel: string): Promise<{
  id: number
  title?: string
  username?: string
  type?: string
} | null> {
  try {
    const result = (await telegramApi('getChat', { chat_id: channel })) as {
      id?: number
      title?: string
      username?: string
      type?: string
    }
    if (!result?.id) return null
    return {
      id: Number(result.id),
      title: result.title,
      username: result.username,
      type: result.type,
    }
  } catch {
    return null
  }
}

export async function telegramGetChatMemberCount(chatId: string | number): Promise<number | null> {
  try {
    const n = await telegramApi('getChatMemberCount', { chat_id: chatId })
    const count = Number(n)
    return Number.isFinite(count) && count >= 0 ? count : null
  } catch {
    return null
  }
}

export function normalizeTelegramChannel(raw: string): string {
  const s = raw.trim()
  if (!s) return ''
  const tme = s.match(/^(?:https?:\/\/)?t\.me\/(?:s\/)?([A-Za-z0-9_]{5,32})\/?$/i)
  if (tme?.[1]) return `@${tme[1]}`
  const at = s.replace(/^@+/, '')
  if (/^[A-Za-z0-9_]{5,32}$/.test(at)) return `@${at}`
  if (/^-100\d{6,}$/.test(s)) return s
  return ''
}

export function telegramDeskHandle(username: string | undefined, telegramUserId: number | string): string {
  const raw = String(username || '')
    .replace(/^@+/, '')
    .replace(/[^A-Za-z0-9_]/g, '')
  if (/^[A-Za-z0-9_]{2,15}$/.test(raw)) return raw
  const id = String(telegramUserId).replace(/\D/g, '').slice(-12)
  return `tg_${id}`.slice(0, 15)
}

export function isTelegramOnlyKol(xUserId: string | null | undefined): boolean {
  return String(xUserId || '').startsWith('tg:')
}

export function telegramSyntheticXUserId(telegramUserId: number | string): string {
  return `tg:${String(telegramUserId).trim()}`
}
