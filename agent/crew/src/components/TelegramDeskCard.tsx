import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  TELEGRAM_BOT_URL,
  TELEGRAM_BOT_USERNAME,
  stripTelegramAuthParams,
  telegramAuthFromLocation,
} from '../lib/telegram-login'
import { TelegramLogin } from './TelegramLogin'

const API = (
  (import.meta.env.VITE_CREW_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'https://api.crewpay.dev'
)

type Props = {
  telegramLogin: boolean
  telegramUsername?: string | null
  telegramAlerts?: boolean
  telegramChatId?: string | null
  tgChannel?: string | null
  tgChannelVerified?: boolean
  tgReach?: number | null
  telegramOnly?: boolean
  onRefresh: () => void
}

export function TelegramDeskCard({
  telegramLogin,
  telegramUsername,
  telegramAlerts,
  telegramChatId,
  tgChannel,
  tgChannelVerified,
  tgReach,
  telegramOnly,
  onRefresh,
}: Props) {
  const [params, setSearchParams] = useSearchParams()
  const [channel, setChannel] = useState(tgChannel || '')
  const [phrase, setPhrase] = useState<string | null>(null)
  const [deepLink, setDeepLink] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const telegramReturnStarted = useRef(false)

  async function post(path: string, body?: unknown) {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const json = (await res.json()) as Record<string, unknown>
    if (!res.ok) throw new Error(String(json.error || 'Request failed'))
    return json
  }

  async function onStartAlerts() {
    setBusy('start')
    setMsg(null)
    try {
      const out = await post('/api/kols/telegram/start-code')
      setDeepLink(String(out.deepLink || TELEGRAM_BOT_URL))
      await post('/api/kols/telegram/alerts', { enabled: true })
      setMsg('Open the bot and tap Start so we can DM you.')
      onRefresh()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not enable alerts.')
    } finally {
      setBusy(null)
    }
  }

  async function onStopAlerts() {
    setBusy('stop')
    setMsg(null)
    try {
      await post('/api/kols/telegram/alerts', { enabled: false })
      setMsg('Alerts muted.')
      onRefresh()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not mute alerts.')
    } finally {
      setBusy(null)
    }
  }

  async function onChannelStart() {
    setBusy('channel')
    setMsg(null)
    try {
      const out = await post('/api/kols/telegram/channel/start', { channel })
      setPhrase(String(out.phrase || ''))
      setMsg(String(out.instructions || 'Post the code, then verify.'))
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not start verify.')
    } finally {
      setBusy(null)
    }
  }

  async function onChannelVerify() {
    setBusy('verify')
    setMsg(null)
    try {
      const out = await post('/api/kols/telegram/channel/verify')
      setMsg(String(out.note || (out.verified ? 'Verified.' : 'Not verified yet.')))
      onRefresh()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not verify channel.')
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => {
    if (telegramReturnStarted.current) return
    const auth = telegramAuthFromLocation(
      params,
      typeof window === 'undefined' ? '' : window.location.hash,
    )
    if (!auth) return
    telegramReturnStarted.current = true
    const next = stripTelegramAuthParams(params)
    setSearchParams(next, { replace: true })
    void (async () => {
      try {
        await post('/api/kols/telegram/login', auth)
        setMsg('Telegram linked.')
        onRefresh()
      } catch (err) {
        setMsg(err instanceof Error ? err.message : 'Could not link Telegram.')
      }
    })()
  }, [onRefresh, params, setSearchParams])

  if (!telegramLogin && !telegramUsername) return null

  return (
    <div className="desk-telegram-card" data-testid="telegram-desk">
      <p className="section-label">Telegram</p>
      <p className="desk-pnl-sub">
        {telegramOnly
          ? 'Telegram-only desk — ranked lower until you verify on X or a channel you own.'
          : 'Optional. X stays primary. Job/hire DMs are opt-in after /start.'}
      </p>
      {telegramUsername ? (
        <p className="hint">
          Linked @{telegramUsername}
          {telegramChatId ? ' · bot started' : ''}
          {telegramAlerts ? ' · alerts on' : ''}
        </p>
      ) : telegramLogin ? (
        <TelegramLogin
          label="Continue with Telegram"
          returnTo={
            typeof window === 'undefined'
              ? undefined
              : `${window.location.origin}${window.location.pathname}`
          }
        />
      ) : null}
      {telegramUsername ? (
        <div className="register-actions">
          <a className="btn btn-ghost btn-sm" href={deepLink || TELEGRAM_BOT_URL} target="_blank" rel="noreferrer">
            Open @{TELEGRAM_BOT_USERNAME}
          </a>
          {telegramAlerts ? (
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy === 'stop'} onClick={() => void onStopAlerts()}>
              {busy === 'stop' ? 'Saving…' : 'Mute alerts'}
            </button>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" disabled={busy === 'start'} onClick={() => void onStartAlerts()}>
              {busy === 'start' ? 'Saving…' : 'Enable job alerts'}
            </button>
          )}
        </div>
      ) : null}
      <label className="register-ref">
        <span>Channel / group (optional)</span>
        <input
          type="text"
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          placeholder="@yourchannel"
          autoComplete="off"
          spellCheck={false}
          maxLength={40}
        />
        <em>Post a one-time code. Member count is stored as reach — not used for rank.</em>
      </label>
      <div className="register-actions">
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy === 'channel'} onClick={() => void onChannelStart()}>
          {busy === 'channel' ? '…' : 'Get code'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy === 'verify'} onClick={() => void onChannelVerify()}>
          {busy === 'verify' ? '…' : 'Verify'}
        </button>
      </div>
      {phrase ? <p className="register-invite-chip">Post {phrase} in the channel</p> : null}
      {tgChannel ? (
        <p className="hint">
          {tgChannel}
          {tgChannelVerified ? ' · verified' : ' · not verified'}
          {tgReach != null ? ` · ${tgReach} members (signal only)` : ''}
        </p>
      ) : null}
      {msg ? <p className="hint">{msg}</p> : null}
    </div>
  )
}
