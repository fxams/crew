import { useEffect, useRef } from 'react'
import {
  TELEGRAM_BOT_USERNAME,
  isTelegramWidgetAuth,
  telegramWidgetScriptSrc,
  type TelegramWidgetAuth,
} from '../lib/telegram-login'

const CALLBACK = 'onCrewTelegramAuth'

type Props = {
  botUsername?: string
  onAuth: (user: TelegramWidgetAuth) => void
}

export function TelegramLogin({ botUsername = TELEGRAM_BOT_USERNAME, onAuth }: Props) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = host.current
    if (!node) return
    const w = window as unknown as Record<string, unknown>
    w[CALLBACK] = (user: unknown) => {
      if (isTelegramWidgetAuth(user)) onAuth(user)
    }
    node.replaceChildren()
    const script = document.createElement('script')
    script.async = true
    script.src = telegramWidgetScriptSrc()
    script.setAttribute('data-telegram-login', botUsername.replace(/^@+/, ''))
    script.setAttribute('data-size', 'large')
    script.setAttribute('data-userpic', 'false')
    script.setAttribute('data-radius', '8')
    script.setAttribute('data-request-access', 'write')
    script.setAttribute('data-onauth', `${CALLBACK}(user)`)
    node.appendChild(script)
    return () => {
      delete w[CALLBACK]
      node.replaceChildren()
    }
  }, [botUsername, onAuth])

  return <div ref={host} className="telegram-login-host" data-testid="telegram-login" />
}
