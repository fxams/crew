import { useEffect, useMemo, useRef, useState } from 'react'
import {
  TELEGRAM_BOT_USERNAME,
  allowTelegramWidgetIframe,
  telegramBotIdFromEnv,
  telegramOauthUrl,
  telegramWidgetScriptSrc,
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
  allowWidget?: boolean
}

/**
 * Always a visible oauth.telegram.org button. The official widget iframe is
 * optional on desktop only — and only kept if an iframe actually appears.
 */
export function TelegramLogin({
  botUsername = TELEGRAM_BOT_USERNAME,
  botId,
  origin,
  returnTo,
  label = 'Continue with Telegram',
  className,
  allowWidget = true,
}: Props) {
  const [resolvedId, setResolvedId] = useState<number | null>(() =>
    botId && botId > 0 ? botId : telegramBotIdFromEnv(),
  )
  const [widgetReady, setWidgetReady] = useState(false)
  const host = useRef<HTMLDivElement>(null)
  const desktopWidget =
    allowWidget && typeof navigator !== 'undefined' && allowTelegramWidgetIframe(navigator.userAgent)

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
      typeof window === 'undefined' ? 'https://crewpay.dev/register' : `${window.location.origin}${window.location.pathname}`
    return telegramOauthUrl({
      botId: resolvedId,
      origin: origin || here,
      returnTo: returnTo || path,
    })
  }, [resolvedId, origin, returnTo])

  useEffect(() => {
    if (!desktopWidget) return
    const node = host.current
    if (!node) return
    node.replaceChildren()
    const script = document.createElement('script')
    script.async = true
    script.src = telegramWidgetScriptSrc()
    script.setAttribute('data-telegram-login', botUsername.replace(/^@+/, ''))
    script.setAttribute('data-size', 'large')
    script.setAttribute('data-userpic', 'false')
    script.setAttribute('data-radius', '8')
    script.setAttribute('data-request-access', 'write')
    script.setAttribute('data-auth-url', returnTo || href)
    node.appendChild(script)
    const markReady = () => {
      if (node.querySelector('iframe')) setWidgetReady(true)
    }
    const obs = new MutationObserver(markReady)
    obs.observe(node, { childList: true, subtree: true })
    const timer = window.setTimeout(() => {
      if (!node.querySelector('iframe')) {
        node.replaceChildren()
        setWidgetReady(false)
      }
    }, 2500)
    return () => {
      window.clearTimeout(timer)
      obs.disconnect()
      node.replaceChildren()
      setWidgetReady(false)
    }
  }, [botUsername, desktopWidget, href, returnTo])

  return (
    <div className={`telegram-login${className ? ` ${className}` : ''}`}>
      {desktopWidget ? (
        <div
          ref={host}
          className={`telegram-login-host${widgetReady ? ' is-ready' : ''}`}
          data-testid="telegram-widget"
          hidden={!widgetReady}
        />
      ) : null}
      <a
        className="btn btn-sm telegram-continue-btn"
        href={href}
        data-testid="telegram-continue"
        data-telegram-login={botUsername.replace(/^@+/, '')}
        data-telegram-bot-id={resolvedId ? String(resolvedId) : undefined}
      >
        {label}
      </a>
    </div>
  )
}
