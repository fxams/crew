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

export function telegramWidgetScriptSrc(): string {
  return 'https://telegram.org/js/telegram-widget.js?22'
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
