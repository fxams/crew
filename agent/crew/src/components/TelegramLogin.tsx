import { useEffect, useMemo, useState } from 'react'
import {
  TELEGRAM_BOT_USERNAME,
  telegramBotIdFromEnv,
  telegramOauthUrl,
} from '../lib/telegram-login'

const API = (
  (import.meta.env.VITE_CREW_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'https://api.crewpay.dev'
)

type Props = {
  botUsername?: string
  botId?: number | null
  origin?: string
  returnTo?: string
  label?: string
  className?: string
}

/**
 * Visible Telegram CTA. The official widget iframe is blocked by CSP / many
 * in-app browsers, so this is always an oauth.telegram.org redirect link.
 */
export function TelegramLogin({
  botUsername = TELEGRAM_BOT_USERNAME,
  botId,
  origin,
  returnTo,
  label = 'Continue with Telegram',
  className,
}: Props) {
  const [resolvedId, setResolvedId] = useState<number | null>(() =>
    botId && botId > 0 ? botId : telegramBotIdFromEnv(),
  )

  useEffect(() => {
    if (botId && botId > 0) {
      setResolvedId(botId)
      return
    }
    const fromEnv = telegramBotIdFromEnv()
    if (fromEnv) {
      setResolvedId(fromEnv)
      return
    }
    let cancelled = false
    void fetch(`${API}/api/kols/register/status`)
      .then((r) => (r.ok ? r.json() : null))
      .then((status: { telegram?: { botId?: number } } | null) => {
        const id = Number(status?.telegram?.botId)
        if (!cancelled && id > 0) setResolvedId(id)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [botId])

  const href = useMemo(() => {
    const here = typeof window === 'undefined' ? 'https://crewpay.dev' : window.location.origin
    const path =
      typeof window === 'undefined' ? '/register' : `${window.location.origin}${window.location.pathname}`
    return telegramOauthUrl({
      botId: resolvedId,
      origin: origin || here,
      returnTo: returnTo || path,
    })
  }, [resolvedId, origin, returnTo])

  return (
    <a
      className={`btn btn-ghost btn-sm telegram-continue-btn${className ? ` ${className}` : ''}`}
      href={href}
      data-testid="telegram-continue"
      data-telegram-login={botUsername.replace(/^@+/, '')}
      data-telegram-bot-id={resolvedId ? String(resolvedId) : undefined}
    >
      {label}
    </a>
  )
}
