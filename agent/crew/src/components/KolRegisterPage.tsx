import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import { useAccount } from 'wagmi'
import { useConnectModal } from './ConnectModal'
import {
  backpackBrowseUrl,
  detectInjected,
  isMobileUserAgent,
  phantomBrowseUrl,
  solflareBrowseUrl,
} from '../lib/wallet'
import bs58 from 'bs58'
import { CREW_VERSION, KOL_PROGRAM_ENABLED, KOL_REFERRAL_CUT_PCT } from '../lib/config'
import { fetchKolProgramMe } from '../lib/kol-program'
import { consumeKolHubReturnPath } from '../lib/kol-x-sign-in'
import { KolProgramPanel } from './KolProgramPanel'
import { formatSol } from '../lib/format-sol'
import { formatUtc } from '../lib/format-utc'
import {
  classifyStuckXOauth,
  clearPendingRegistration,
  clearStuckXOauth,
  humanizeRegisterError,
  isRecoverableXOauthError,
  loadPendingRegistration,
  loadStuckXOauth,
  savePendingRegistration,
  saveStuckXOauth,
  stuckXOauthMessage,
  takeXOauthAutoRestart,
  type StuckXOauth,
} from '../lib/register-pending'
import { RegisterRecovery } from './RegisterRecovery'
import {
  lookupRegisteredHandle,
  lookupRegistrationProgress,
  useOwnRegisteredHandle,
} from '../lib/registered-kol'
import { kolProfilePath } from '../lib/routes'
import {
  ADD_WALLET_TO_RECEIVE,
  BASE_WALLET_REGISTER_HINT,
  NO_CRYPTO_NEEDED,
  SOCIAL_WALLET_NOTE,
  WALLET_OPTIONAL_HINT,
} from '../lib/kol-onboarding'
import { evmAddressFieldError, isEvmAddress } from '../lib/evm-address'
import { registerKolEvmWallet } from '../lib/kol-evm-wallet'
import { isPayoutWallet } from '../lib/payout-wallet'
import { resolvePrivyAppId } from '../lib/privy-app'
import { TelegramLogin } from './TelegramLogin'
import {
  TELEGRAM_BOT_USERNAME,
  stripTelegramAuthParams,
  telegramAuthFromLocation,
  type TelegramWidgetAuth,
  telegramOauthUrl,
} from '../lib/telegram-login'
import { JoinTelegramBox } from './JoinTelegramBox'
import { normalizeRegisterSrc, registerPageQuery } from '../lib/register-attribution'

const MCP_PIN = '1.2.13'

const API = (
  (import.meta.env.VITE_CREW_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'https://api.crewpay.dev'
)

const CHECK_HINT =
  'If X opened in Safari or the X app, finish sign-in there, then return to this wallet browser and tap Check.'

type Registration = {
  xUsername: string
  xName: string
  xVerified: boolean
  followers: number
  following: number
  tweetCount: number
  wallet: string
  solEarned?: number
  registeredAt: string
  rank: number
  description: string
  referralCode?: string
}

function shortAddr(addr: string) {
  if (!addr || addr.length < 10) return addr || '—'
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`
}

function formatFollowers(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function formatWhen(iso: string) {
  return formatUtc(iso)
}

function normalizeRef(raw: string | null): string {
  return (raw || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 24)
}

type PaidRow = { handle: string; totalSol: number; remits: number; tickers: string[] }

/** Mobile browsers without an injected wallet: offer Phantom / Solflare universal links. */
function mobileBrowseLinks(): { phantom: string; solflare: string; backpack: string } | null {
  if (typeof window === 'undefined') return null
  if (detectInjected(window).solana) return null
  if (!isMobileUserAgent(navigator.userAgent)) return null
  const here = window.location.href
  const origin = window.location.origin
  return {
    phantom: phantomBrowseUrl(here, origin),
    solflare: solflareBrowseUrl(here, origin),
    backpack: backpackBrowseUrl(here),
  }
}

function PaidByAgents() {
  const [rows, setRows] = useState<PaidRow[] | null>(null)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`${API}/api/proof`)
        const body = (await res.json()) as { leaderboard?: PaidRow[] }
        if (!cancelled) setRows((body.leaderboard || []).slice(0, 8))
      } catch {
        if (!cancelled) setRows([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])
  if (!rows || rows.length === 0) return null
  return (
    <div className="register-paid" aria-label="KOLs already paid by agents">
      <p className="section-label">Already picked by Autohire · not registered yet</p>
      <p className="section-sub">
        These KOLs were picked by Autohire and paid on-chain from coin fee-shares. Is one of them you? Claim the desk.
      </p>
      <div className="register-paid-list">
        {rows.map((r) => {
          const h = r.handle.replace(/^@/, '')
          return (
            <Link className="register-paid-item" key={h} to={kolProfilePath(h)}>
              <strong>@{h}</strong>
              <span>
                {r.remits} payment{r.remits === 1 ? '' : 's'} · {r.tickers.length} coin{r.tickers.length === 1 ? '' : 's'}
              </span>
              <span>{formatSol(r.totalSol)} SOL</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function HiredLookup() {
  const navigate = useNavigate()
  const [h, setH] = useState('')
  const [busy, setBusy] = useState(false)
  const [missing, setMissing] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const clean = h.trim().replace(/^@/, '').replace(/^https?:\/\/(x|twitter)\.com\//i, '').split(/[/?#]/)[0]
  const valid = /^[A-Za-z0-9_]{1,15}$/.test(clean)

  async function onLookup() {
    if (!valid || busy) return
    setBusy(true)
    setMissing(false)
    setLookupError(null)
    try {
      const res = await fetch(`${API}/api/kols/registered/${encodeURIComponent(clean)}`)
      if (res.ok) {
        navigate(kolProfilePath(clean))
        return
      }
      if (res.status === 404) {
        setMissing(true)
        return
      }
      setLookupError('Could not check that handle. Try again.')
    } catch {
      setLookupError('Could not reach CrewPay. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="register-lookup"
      data-testid="handle-lookup"
      onSubmit={(e) => {
        e.preventDefault()
        void onLookup()
      }}
    >
      <label>
        <span>Already hired? Check your X handle</span>
        <div className="register-lookup-row">
          <input
            type="text"
            value={h}
            onChange={(e) => {
              setH(e.target.value)
              setMissing(false)
              setLookupError(null)
            }}
            placeholder="@yourhandle"
            autoComplete="off"
            spellCheck={false}
            maxLength={40}
            data-testid="handle-lookup-input"
          />
          <button
            type="submit"
            className="btn btn-ghost btn-sm"
            disabled={!valid || busy}
            data-testid="handle-lookup-submit"
          >
            {busy ? 'Checking…' : 'Check'}
          </button>
        </div>
      </label>
      {missing ? (
        <RegisterRecovery
          testId="handle-lookup-missing"
          message={`No desk for @${clean} yet. Register to claim it.`}
          actionLabel="Go to register"
          to="/register"
        />
      ) : null}
      {lookupError ? (
        <RegisterRecovery
          testId="handle-lookup-error"
          message={lookupError}
          actionLabel="Try again"
          onAction={() => void onLookup()}
        />
      ) : null}
    </form>
  )
}

export function KolRegisterPage() {
  const wallet = useWallet()
  const { address: evmAddress } = useAccount()
  const { open: openConnect } = useConnectModal()
  const navigate = useNavigate()
  const [params, setSearchParams] = useSearchParams()
  const [board, setBoard] = useState<Registration[]>([])
  const [tape, setTape] = useState<Registration[]>([])
  const [total, setTotal] = useState(0)
  const [xOauth, setXOauth] = useState<boolean | null>(null)
  const [telegramBot, setTelegramBot] = useState(TELEGRAM_BOT_USERNAME)
  const [telegramBotId, setTelegramBotId] = useState<number | null>(null)
  const [privyAppId, setPrivyAppId] = useState(() => resolvePrivyAppId())
  const [busy, setBusy] = useState(false)
  const [awaitingX, setAwaitingX] = useState(false)
  const [stuckOauth, setStuckOauth] = useState<StuckXOauth | null>(() => loadStuckXOauth())
  const [checkBusy, setCheckBusy] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)
  const [error, setError] = useState<string | null>(() => {
    const fromUrl = params.get('error')
    if (fromUrl) return fromUrl
    const stuck = loadStuckXOauth()
    return stuck ? stuckXOauthMessage(stuck) : null
  })
  const recoverOnceRef = useRef(false)
  const registerInFlightRef = useRef(false)
  const onRegisterRef = useRef<() => Promise<void>>(async () => {})
  const [refInput, setRefInput] = useState(() => normalizeRef(params.get('ref')))
  const [evmWallet, setEvmWallet] = useState('')
  const [moreOpen, setMoreOpen] = useState(() => Boolean(normalizeRef(params.get('ref'))))
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null)
  const connectedWallet = wallet.publicKey?.toBase58() || ''
  const ownHandle = useOwnRegisteredHandle(connectedWallet, refreshTick)
  const registeredHandle = params.get('registered') === '1' ? params.get('handle') : null
  const deskHandle = registeredHandle || ownHandle
  const alreadyRegistered = Boolean(ownHandle || registeredHandle)
  const referralCode = normalizeRef(refInput)
  const registerSrc = normalizeRegisterSrc(params.get('src'))
  const autoTgLogin = params.get('tg') === '1'
  const tgAutoStarted = useRef(false)
  const registerReturnTo =
    typeof window === 'undefined'
      ? 'https://crewpay.dev/register'
      : `${window.location.origin}/register${registerPageQuery({
          ref: referralCode,
          src: registerSrc,
          tg: autoTgLogin,
        })}`
  const showAgentSnippets = !alreadyRegistered && referralCode.length >= 2
  const optionalsFilled = referralCode.length >= 2
  const evmFieldError = evmAddressFieldError(evmWallet)
  const baseWalletReady = isEvmAddress(evmWallet)

  const claimKeySnippet = `curl -sS -X POST https://api.crewpay.dev/api/agent/keys/claim \\
  -H 'content-type: application/json' \\
  -d '{"label":"my-agent","referralCode":"${referralCode}"}'`

  const mcpSnippet = `{
  "mcpServers": {
    "crewpay": {
      "command": "npx",
      "args": ["-y", "crewpay-mcp@${MCP_PIN}"],
      "env": {
        "CREWPAY_REFERRAL_CODE": "${referralCode}"
      }
    }
  }
}`

  const envSnippet = `CREWPAY_REFERRAL_CODE=${referralCode}`

  async function copyText(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedSnippet(id)
      window.setTimeout(() => setCopiedSnippet(null), 1600)
    } catch {
      setCopiedSnippet(null)
    }
  }

  const load = useCallback(async () => {
    const [statusRes, boardRes] = await Promise.all([
      fetch(`${API}/api/kols/register/status`),
      fetch(`${API}/api/kols/registered?limit=40`),
    ])
    if (statusRes.ok) {
      const status = (await statusRes.json()) as {
        xOauth?: boolean
        privy?: { enabled?: boolean; appId?: string }
        telegram?: { enabled?: boolean; botUsername?: string; botId?: number }
      }
      setXOauth(Boolean(status.xOauth))
      if (status.telegram?.botUsername) setTelegramBot(status.telegram.botUsername.replace(/^@+/, ''))
      const statusBotId = Number(status.telegram?.botId)
      if (statusBotId > 0) setTelegramBotId(statusBotId)
      setPrivyAppId(resolvePrivyAppId(status.privy?.appId))
    } else {
      setXOauth(false)
    }
    if (boardRes.ok) {
      const data = (await boardRes.json()) as {
        leaderboard?: Registration[]
        tape?: Registration[]
        total?: number
      }
      setBoard(data.leaderboard || [])
      setTape(data.tape || [])
      setTotal(data.total || 0)
    }
  }, [])

  useEffect(() => {
    void load().catch(() => setError('Could not load the registration board.'))
  }, [load])

  useEffect(() => {
    if (!KOL_PROGRAM_ENABLED) return
    const returnPath = consumeKolHubReturnPath()
    if (!returnPath) return
    void fetchKolProgramMe().then((profile) => {
      if (profile) navigate(returnPath, { replace: true })
    })
  }, [navigate])

  useEffect(() => {
    const fromUrl = normalizeRef(params.get('ref'))
    if (fromUrl) {
      setRefInput(fromUrl)
      setMoreOpen(true)
    }
  }, [params])

  useEffect(() => {
    if (evmAddress && !evmWallet.trim()) setEvmWallet(evmAddress)
  }, [evmAddress, evmWallet])

  useEffect(() => {
    const stored = loadPendingRegistration()
    if (stored) {
      setAwaitingX(true)
      if (stored.evmWallet && !evmWallet.trim()) setEvmWallet(stored.evmWallet)
    }
  }, [])

  const finishOnDesk = useCallback(
    async (_handle: string) => {
      const pending = loadPendingRegistration()
      const pubkey = (wallet.publicKey?.toBase58() || pending?.wallet || '').trim()
      const evmTarget = (evmWallet.trim() || pending?.evmWallet || '').trim()
      if (isPayoutWallet(pubkey) && wallet.signMessage && isEvmAddress(evmTarget)) {
        try {
          await registerKolEvmWallet({
            apiBase: API,
            solanaWallet: pubkey,
            signMessage: wallet.signMessage,
            evmWallet: evmTarget,
          })
        } catch {
          /* desk banner lets them retry */
        }
      }
      clearPendingRegistration()
      clearStuckXOauth()
      setAwaitingX(false)
      setStuckOauth(null)
      setRefreshTick((n) => n + 1)
      const returnPath = consumeKolHubReturnPath()
      navigate(returnPath || '/kol')
    },
    [evmWallet, navigate, wallet.publicKey, wallet.signMessage],
  )

  const onCheck = useCallback(
    async (opts?: { silent?: boolean }): Promise<boolean> => {
      const pending = loadPendingRegistration()
      const pubkey = (wallet.publicKey?.toBase58() || pending?.wallet || '').trim()
      if (!opts?.silent) {
        setCheckBusy(true)
        setError(null)
      }
      try {
        if (isPayoutWallet(pubkey)) {
          const handle = await lookupRegisteredHandle(pubkey)
          setRefreshTick((n) => n + 1)
          if (handle) {
            finishOnDesk(handle)
            return true
          }
        }
        const me = await fetch(`${API}/api/kols/me`, { credentials: 'include' })
        if (me.ok) {
          const body = (await me.json()) as { profile?: { xUsername?: string } }
          const handle = body.profile?.xUsername?.trim()
          if (handle) {
            finishOnDesk(handle)
            return true
          }
        }
        if (pending?.sid) {
          const progress = await lookupRegistrationProgress(pending.sid)
          if (progress?.status === 'done' && progress.handle) {
            finishOnDesk(progress.handle)
            return true
          }
          if (progress?.status === 'used' || progress?.status === 'expired') {
            saveStuckXOauth(progress.status)
            setStuckOauth(progress.status)
            if (!opts?.silent) setError(stuckXOauthMessage(progress.status))
            return false
          }
        }
        if (!opts?.silent) {
          setError(`Not on the board yet. ${CHECK_HINT}`)
        }
        return false
      } catch (err) {
        if (!opts?.silent) {
          setError(err instanceof Error ? err.message : 'Could not check registration.')
        }
        return false
      } finally {
        if (!opts?.silent) setCheckBusy(false)
      }
    },
    [finishOnDesk, wallet.publicKey],
  )

  useEffect(() => {
    if (!awaitingX) return
    void onCheck({ silent: true })
    const onShow = () => {
      void onCheck({ silent: true })
    }
    window.addEventListener('focus', onShow)
    window.addEventListener('pageshow', onShow)
    document.addEventListener('visibilitychange', onShow)
    const tick = window.setInterval(() => {
      if (document.visibilityState === 'visible') void onCheck({ silent: true })
    }, 4000)
    return () => {
      window.removeEventListener('focus', onShow)
      window.removeEventListener('pageshow', onShow)
      document.removeEventListener('visibilitychange', onShow)
      window.clearInterval(tick)
    }
  }, [awaitingX, onCheck])

  useEffect(() => {
    if (!awaitingX || !isPayoutWallet(connectedWallet)) return
    void onCheck({ silent: true })
  }, [awaitingX, connectedWallet, onCheck])

  const onRegister = useCallback(async () => {
    if (alreadyRegistered && ownHandle) {
      return
    }
    if (registerInFlightRef.current || busy) {
      return
    }
    registerInFlightRef.current = true
    setError(null)
    const evmTrim = evmWallet.trim()
    const evmErr = evmAddressFieldError(evmWallet)
    if (evmErr) {
      setError(evmErr)
      registerInFlightRef.current = false
      return
    }
    const pubkey = (wallet.publicKey?.toBase58() || '').trim()
    const canSign = Boolean(wallet.publicKey && wallet.signMessage)
    setBusy(true)
    try {
      const startBodyPayload: Record<string, string> = {
        ...(referralCode.length >= 2 ? { referralCode } : {}),
        ...(registerSrc.length >= 2 ? { registerSrc } : {}),
      }
      if (isPayoutWallet(pubkey) && canSign) {
        const nonceRes = await fetch(`${API}/api/kols/register/nonce`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ wallet: pubkey }),
        })
        const nonceBody = (await nonceRes.json()) as { message?: string; error?: string }
        if (!nonceRes.ok || !nonceBody.message) {
          throw new Error(nonceBody.error || 'Could not start registration.')
        }
        const encoder = new TextEncoder()
        const sigBytes = await wallet.signMessage!(encoder.encode(nonceBody.message))
        startBodyPayload.wallet = pubkey
        startBodyPayload.message = nonceBody.message
        startBodyPayload.signature = bs58.encode(sigBytes)
      }
      const startRes = await fetch(`${API}/api/kols/register/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(startBodyPayload),
      })
      const startBody = (await startRes.json()) as {
        authorizeUrl?: string
        error?: string
        sid?: string
      }
      if (!startRes.ok || !startBody.authorizeUrl) {
        throw new Error(startBody.error || 'X sign-in did not start.')
      }
      savePendingRegistration(isPayoutWallet(pubkey) ? pubkey : '', Date.now(), {
        sid: startBody.sid,
        ...(evmTrim ? { evmWallet: evmTrim } : {}),
      })
      clearStuckXOauth()
      setStuckOauth(null)
      setAwaitingX(true)
      window.location.assign(startBody.authorizeUrl)
    } catch (err) {
      setError(humanizeRegisterError(err instanceof Error ? err.message : 'Registration failed.'))
      setBusy(false)
      registerInFlightRef.current = false
    }
  }, [alreadyRegistered, busy, evmWallet, ownHandle, referralCode, registerSrc, wallet])

  onRegisterRef.current = onRegister

  const onStartOver = useCallback(() => {
    clearPendingRegistration()
    setAwaitingX(false)
    setError(null)
    void onRegister()
  }, [onRegister])

  useEffect(() => {
    const xoauth = params.get('xoauth')
    const err = params.get('error')
    if (!isRecoverableXOauthError(err, xoauth)) return
    if (recoverOnceRef.current) return
    recoverOnceRef.current = true
    const next = new URLSearchParams(params)
    next.delete('error')
    next.delete('xoauth')
    setSearchParams(next, { replace: true })
    const kind = classifyStuckXOauth(err, xoauth)
    if (!kind) return
    saveStuckXOauth(kind)
    setStuckOauth(kind)
    setError(stuckXOauthMessage(kind))
    void (async () => {
      const found = await onCheck({ silent: true })
      if (found) return
      clearPendingRegistration()
      setAwaitingX(false)
      if (kind !== 'cancelled' && takeXOauthAutoRestart()) {
        setError('Starting a fresh X sign-in…')
        await onRegisterRef.current()
        return
      }
      setError(stuckXOauthMessage(kind))
    })()
  }, [onCheck, params, setSearchParams])

  const onTelegramAuth = useCallback(
    async (user: TelegramWidgetAuth) => {
      setError(null)
      setBusy(true)
      const fromTgBot = autoTgLogin || registerSrc === 'tg_bot'
      try {
        const res = await fetch(`${API}/api/kols/telegram/login`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ...user,
            referralCode: refInput,
            ...(registerSrc.length >= 2 ? { registerSrc } : {}),
          }),
        })
        const body = (await res.json()) as {
          ok?: boolean
          error?: string
          handle?: string
          deskPath?: string
        }
        if (!res.ok || !body.handle) throw new Error(body.error || 'Telegram login failed.')
        if (fromTgBot) {
          try {
            await fetch(`${API}/api/kols/telegram/alerts`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ enabled: true }),
            })
            const startRes = await fetch(`${API}/api/kols/telegram/start-code`, {
              method: 'POST',
              credentials: 'include',
            })
            const startBody = (await startRes.json()) as { deepLink?: string }
            if (startRes.ok && startBody.deepLink) {
              window.location.assign(startBody.deepLink)
              return
            }
          } catch {
            /* fall through to desk */
          }
        }
        navigate(body.deskPath || `/kol/${body.handle}?registered=1&from=tg`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Telegram login failed.')
        setBusy(false)
      }
    },
    [autoTgLogin, navigate, refInput, registerSrc],
  )

  const telegramReturnStarted = useRef(false)
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
    if (typeof window !== 'undefined' && window.location.hash) {
      window.history.replaceState(null, '', `${window.location.pathname}${next.toString() ? `?${next}` : ''}`)
    }
    void onTelegramAuth(auth)
  }, [onTelegramAuth, params, setSearchParams])

  useEffect(() => {
    if (!autoTgLogin || alreadyRegistered || busy || telegramReturnStarted.current) return
    if (tgAutoStarted.current) return
    if (!telegramBotId || telegramBotId <= 0) return
    if (telegramAuthFromLocation(params, typeof window === 'undefined' ? '' : window.location.hash)) {
      return
    }
    tgAutoStarted.current = true
    const href = telegramOauthUrl({
      botId: telegramBotId,
      origin: window.location.origin,
      returnTo: registerReturnTo,
    })
    window.location.assign(href)
  }, [
    alreadyRegistered,
    autoTgLogin,
    busy,
    params,
    registerReturnTo,
    telegramBotId,
  ])

  const connected = isPayoutWallet(connectedWallet)

  return (
    <div className="app-shell page-kols page-register">
      <section className="section section-kols">
        <div className="kols-page-head register-fold-head">
          <div className="launch-page-head-row">
            <Link className="launch-back" to="/kols">
              ← Autohire list
            </Link>
            <p className="section-label">KOL · v{CREW_VERSION}</p>
          </div>
          <h1 className="section-title">Join the crew.</h1>
          {alreadyRegistered && deskHandle ? (
            <p className="section-sub">
              Registered KOLs, tape, and the leaderboard stay public.
            </p>
          ) : (
            <>
              <p className="section-sub">
                {NO_CRYPTO_NEEDED} Register with X — or Telegram. About a minute.
              </p>
              <p className="register-no-crypto">{WALLET_OPTIONAL_HINT}</p>
              {referralCode.length >= 2 ? (
                <p className="register-invite-chip">
                  Invite code <strong>{referralCode}</strong>
                </p>
              ) : null}
            </>
          )}
        </div>

        <JoinTelegramBox />

        <div className="register-fold">
          {alreadyRegistered && deskHandle ? (
            <div className="register-card register-card-done">
              <p className="register-ok">
                You&apos;re registered as @{deskHandle}.{' '}
                <Link to={kolProfilePath(deskHandle)}>Open Desk</Link>
              </p>
            </div>
          ) : (
          <div className="register-card" id="register-join" data-testid="register-join">
            <ol className="register-steps">
              <li className={awaitingX || deskHandle ? 'is-done' : stuckOauth ? 'is-stuck' : ''}>
                <strong>1. X</strong>
                <span>
                  {xOauth === false
                    ? 'Waiting on X app credentials'
                    : stuckOauth
                      ? 'Start over'
                      : awaitingX
                        ? 'Waiting…'
                        : 'Primary'}
                </span>
              </li>
              <li>
                <strong>2. Telegram</strong>
                <span>Continue with Telegram</span>
              </li>
              <li className={connected ? 'is-done' : ''}>
                <strong>3. Wallet</strong>
                <span>
                  {connected
                    ? shortAddr(connectedWallet)
                    : privyAppId
                      ? 'After X'
                      : 'Optional'}
                </span>
              </li>
              <li className={baseWalletReady ? 'is-done' : ''}>
                <strong>4. Base</strong>
                <span>{baseWalletReady ? shortAddr(evmWallet.trim()) : 'Optional'}</span>
              </li>
            </ol>
            <p className="register-no-crypto register-no-crypto-cta">{NO_CRYPTO_NEEDED}</p>

            <div className="register-base-card" data-testid="register-base-wallet">
              <label className="register-ref register-evm">
                <span>Base wallet (0x…)</span>
                <input
                  type="text"
                  value={evmWallet}
                  onChange={(e) => setEvmWallet(e.target.value)}
                  placeholder="0x…"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={42}
                  inputMode="text"
                  aria-invalid={evmFieldError ? true : undefined}
                />
                <em>{BASE_WALLET_REGISTER_HINT}</em>
                {evmFieldError ? <p className="register-err register-evm-err">{evmFieldError}</p> : null}
              </label>
              <p className="hint register-base-skip">
                Skippable — add or change it anytime on your KOL desk. Linking on desk requires signing
                with your Solana payout wallet.
              </p>
            </div>

            <details
              className="register-more"
              open={moreOpen || optionalsFilled}
              onToggle={(e) => setMoreOpen((e.target as HTMLDetailsElement).open)}
            >
              <summary>Referral code (optional)</summary>
              <label className="register-ref">
                <span>Referral code</span>
                <input
                  type="text"
                  value={refInput}
                  onChange={(e) => setRefInput(e.target.value)}
                  placeholder="friendscode"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={24}
                />
                <em>Who referred you as a KOL (points). You get your own code after you register.</em>
              </label>
            </details>

            {!stuckOauth && awaitingX && !deskHandle ? (
              <p className="hint register-check-hint">{CHECK_HINT}</p>
            ) : null}
            {error && stuckOauth ? (
              <RegisterRecovery
                testId="register-x-recovery"
                message={error}
                actionLabel="Start over"
                onAction={() => void onStartOver()}
              />
            ) : error ? (
              <RegisterRecovery
                testId="register-error"
                message={humanizeRegisterError(error)}
                actionLabel={awaitingX || loadPendingRegistration() ? 'Check' : 'Try again'}
                onAction={() => (awaitingX || loadPendingRegistration() ? void onCheck() : void onRegister())}
              />
            ) : null}
            {xOauth === false ? (
              <p className="register-err">
                X sign-in is not configured on the API yet (X_CLIENT_ID / X_CLIENT_SECRET). The board below still works.
              </p>
            ) : null}

            {!connected && mobileBrowseLinks() ? (
              <p className="hint register-mobile-hint">
                On a phone without a wallet extension?{' '}
                <a href={mobileBrowseLinks()!.phantom} data-testid="open-in-phantom">Open in Phantom</a>
                {' · '}
                <a href={mobileBrowseLinks()!.solflare} data-testid="open-in-solflare">Open in Solflare</a>
                {' · '}
                <a href={mobileBrowseLinks()!.backpack} data-testid="open-in-backpack">Open in Backpack</a>
                {' '}to connect and sign.
              </p>
            ) : null}
            <div className="register-actions register-actions-auth">
              {stuckOauth ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  data-testid="register-start-over"
                  disabled={busy || xOauth === false}
                  onClick={() => void onStartOver()}
                >
                  {busy ? 'Starting…' : 'Start over'}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  data-testid="register-with-x"
                  disabled={busy || xOauth === false}
                  onClick={() => void onRegister()}
                >
                  {busy ? 'Waiting…' : KOL_PROGRAM_ENABLED ? 'Sign in with X' : 'Register with X'}
                </button>
              )}
              <TelegramLogin
                botUsername={telegramBot}
                botId={telegramBotId}
                label="Continue with Telegram"
                returnTo={registerReturnTo}
              />
              {!connected ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  data-testid="register-connect-wallet"
                  onClick={() => openConnect({ preferred: 'solana' })}
                >
                  I already have a wallet
                </button>
              ) : null}
              {awaitingX || stuckOauth ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  data-testid="register-check"
                  disabled={checkBusy}
                  onClick={() => void onCheck()}
                >
                  {checkBusy ? 'Checking…' : 'Check'}
                </button>
              ) : null}
              {awaitingX && !stuckOauth ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy || xOauth === false}
                  onClick={() => void onStartOver()}
                >
                  Start over
                </button>
              ) : null}
            </div>
            <p className="hint register-telegram-label">
              X stays primary. Continue with Telegram opens oauth.telegram.org — no widget iframe
              required on mobile or wallet browsers.
            </p>
            {privyAppId && !connected ? (
              <p className="hint social-wallet-note">{SOCIAL_WALLET_NOTE}</p>
            ) : null}
          </div>
          )}
        </div>

        <div className="register-rest">
          {KOL_PROGRAM_ENABLED ? (
            <KolProgramPanel
              onSignInWithX={() => void onRegister()}
              signInBusy={busy}
              xOauthReady={xOauth ?? undefined}
            />
          ) : null}
          {showAgentSnippets ? (
            <aside className="register-agent-card" aria-label="Agent builders">
              <p className="section-label">Agent builders</p>
              <h2 className="section-title register-board-title">Use this referral code</h2>
              <p className="section-sub">
                Bind at claim time (immutable). Prefer env over pasting codes into chat.
              </p>

              <div className="register-snippet">
                <div className="register-snippet-head">
                  <span>claim-key · referralCode</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => void copyText('claim', claimKeySnippet)}
                  >
                    {copiedSnippet === 'claim' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="register-snippet-pre">{claimKeySnippet}</pre>
              </div>

              <div className="register-snippet">
                <div className="register-snippet-head">
                  <span>MCP · referral_code / CREWPAY_REFERRAL_CODE</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => void copyText('mcp', mcpSnippet)}
                  >
                    {copiedSnippet === 'mcp' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="register-snippet-pre">{mcpSnippet}</pre>
              </div>

              <div className="register-snippet">
                <div className="register-snippet-head">
                  <span>Env</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => void copyText('env', envSnippet)}
                  >
                    {copiedSnippet === 'env' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="register-snippet-pre">{envSnippet}</pre>
              </div>
            </aside>
          ) : null}

          <p className="section-label">Why register</p>
          <ul className="register-why">
            <li>
              <strong>Hired first.</strong> Autohire fills seats with registered KOLs before anyone else.
            </li>
            <li>
              <strong>Your wallet, when you want one.</strong> {ADD_WALLET_TO_RECEIVE}
            </li>
            <li>
              <strong>Referral link.</strong> Agents that claim a key with your code pay you{' '}
              {KOL_REFERRAL_CUT_PCT}% of creator fees on every launch (60/15/{KOL_REFERRAL_CUT_PCT}/20).
            </li>
            <li>
              <strong>Read-only X.</strong> Sign-in only reads your profile. CrewPay can&apos;t post or DM as you.
            </li>
            <li className="register-why-note">
              Payouts depend on trading volume of the coins you&apos;re hired on, so they can be zero. Buyback cron is not
              live.
            </li>
          </ul>

          <HiredLookup />
          <PaidByAgents />

          <div className="register-tape" aria-label="Registration tape">
            <p className="section-label">Tape · {total > 0 ? `${total} registered` : 'early access: be the first KOL to register'}</p>
            {tape.length === 0 ? (
              <p className="section-sub">No outside KOLs registered yet. The first ones fill Autohire seats before anyone else.</p>
            ) : (
              <div className="register-tape-track">
                {tape.map((row) => (
                  <Link
                    className="register-tape-item"
                    key={`tape-${row.xUsername}`}
                    to={kolProfilePath(row.xUsername)}
                  >
                    <strong>@{row.xUsername}</strong>
                    <span>{formatFollowers(row.followers)} followers</span>
                    <span>{shortAddr(row.wallet)}</span>
                    <span>{formatWhen(row.registeredAt)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <h2 className="section-title register-board-title">Leaderboard</h2>
          <p className="section-sub">Ranked by SOL earned on CrewPay (then followers).</p>
          <div className="kols-table kols-table-register" role="table" aria-label="Registered KOL leaderboard">
            <div className="kols-row kols-row-head kols-row-register" role="row">
              <span role="columnheader">#</span>
              <span role="columnheader">X</span>
              <span role="columnheader">SOL earned</span>
              <span role="columnheader">Followers</span>
              <span role="columnheader">Wallet</span>
            </div>
            {board.map((row) => (
              <div className="kols-row kols-row-register" role="row" key={row.xUsername}>
                <span className="kols-rank" role="cell">
                  {row.rank || '—'}
                </span>
                <span className="kols-identity" role="cell">
                  <Link to={kolProfilePath(row.xUsername)}>
                    @{row.xUsername}
                    <span className="kol-verified" title="Registered crew">
                      {' '}
                      ✓
                    </span>
                  </Link>
                  <span className="kols-pump">{row.xName}</span>
                </span>
                <span className="kols-foll" role="cell">
                  {formatSol(Number(row.solEarned || 0))}
                </span>
                <span className="kols-foll" role="cell">
                  {formatFollowers(row.followers)}
                </span>
                <span className="kols-wallet" role="cell" title={row.wallet}>
                  {shortAddr(row.wallet)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
