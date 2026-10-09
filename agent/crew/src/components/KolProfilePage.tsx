import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import { CREW_VERSION } from '../lib/config'
import { kolHandleFromPath } from '../lib/routes'

const API = (
  (import.meta.env.VITE_CREW_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'https://api.crewpay.dev'
)

type Profile = {
  xUsername: string
  xName: string
  xVerified: boolean
  followers: number
  following: number
  tweetCount: number
  profileImageUrl: string | null
  description: string
  wallet: string
  registeredAt: string
  rank: number
}

type DeskCoin = {
  mint: string
  ticker: string
  name: string
  mode: string
  launchedAt: string
  pumpUrl: string
  share: number | null
  hireRole: string | null
  solReceived: number
  launchedByKol: boolean
}

type DeskRemit = {
  mint: string
  ticker: string
  amountSol: number
  mode: string
  at: string
  signature: string
}

type Desk = {
  profile: Profile
  performance: {
    coinsHired: number
    coinsLaunched: number
    solReceived: number
    remitCount: number
    coins: DeskCoin[]
    remits: DeskRemit[]
  }
}

function shortAddr(addr: string) {
  if (!addr || addr.length < 10) return addr || '—'
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`
}

function formatCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function formatSol(n: number) {
  if (!Number.isFinite(n) || n === 0) return '0'
  if (n >= 100) return n.toFixed(2)
  if (n >= 1) return n.toFixed(3)
  const text = n.toFixed(4)
  return text.replace(/0+$/, '').replace(/\.$/, '')
}

function formatWhen(iso: string) {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  return new Date(t).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function KolProfilePage() {
  const { pathname } = useLocation()
  const handle = kolHandleFromPath(pathname) || ''
  const [params] = useSearchParams()
  const wallet = useWallet()
  const [desk, setDesk] = useState<Desk | null>(null)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const justRegistered = params.get('registered') === '1'

  useEffect(() => {
    let cancelled = false
    setDesk(null)
    setMissing(false)
    setError(null)
    void (async () => {
      try {
        const res = await fetch(`${API}/api/kols/registered/${encodeURIComponent(handle)}`)
        const body = (await res.json()) as Desk & { error?: string }
        if (cancelled) return
        if (res.status === 404) {
          setMissing(true)
          return
        }
        if (!res.ok || !body.profile) {
          throw new Error(body.error || 'Could not load this desk.')
        }
        setDesk(body)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load this desk.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [handle])

  const connected = wallet.publicKey?.toBase58() || ''
  const isOwner = Boolean(desk && connected && desk.profile.wallet === connected)

  async function copyWallet() {
    if (!desk) return
    try {
      await navigator.clipboard.writeText(desk.profile.wallet)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="app-shell page-kols page-desk">
      <section className="section section-kols">
        <div className="kols-page-head">
          <div className="launch-page-head-row">
            <Link className="launch-back" to="/register">
              ← Register
            </Link>
            <p className="section-label">KOL desk · v{CREW_VERSION}</p>
          </div>
        </div>

        {justRegistered && desk ? (
          <p className="register-ok">Registered. This desk is yours.</p>
        ) : null}
        {error ? <p className="register-err">{error}</p> : null}

        {!desk && !missing && !error ? <p className="section-sub">Loading desk…</p> : null}

        {missing ? (
          <div className="desk-hero">
            <div>
              <h1 className="section-title">No desk for @{handle}.</h1>
              <p className="section-sub">This X account is not on the CrewPay register yet.</p>
              <Link className="btn btn-primary btn-sm" to="/register">
                Register
              </Link>
            </div>
          </div>
        ) : null}

        {desk ? (
          <>
            <header className="desk-hero">
              {desk.profile.profileImageUrl ? (
                <img
                  className="desk-avatar"
                  src={desk.profile.profileImageUrl}
                  alt=""
                  width={112}
                  height={112}
                />
              ) : (
                <div className="desk-avatar desk-avatar-fallback" aria-hidden>
                  {desk.profile.xUsername.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="desk-identity">
                <p className="desk-kicker">{isOwner ? 'Your desk' : `Rank #${desk.profile.rank || '—'}`}</p>
                <h1 className="desk-name">
                  {desk.profile.xName || desk.profile.xUsername}
                  {desk.profile.xVerified ? <span className="desk-check"> ✓</span> : null}
                </h1>
                <a
                  className="desk-handle"
                  href={`https://x.com/${desk.profile.xUsername}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  @{desk.profile.xUsername}
                </a>
                {desk.profile.description ? <p className="desk-bio">{desk.profile.description}</p> : null}
                <div className="desk-wallet-row">
                  <button type="button" className="desk-wallet" onClick={() => void copyWallet()}>
                    <span>{shortAddr(desk.profile.wallet)}</span>
                    <strong>{copied ? 'Copied' : 'Copy'}</strong>
                  </button>
                  <a
                    className="btn btn-ghost btn-sm"
                    href={`https://solscan.io/account/${desk.profile.wallet}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Solscan
                  </a>
                  <a
                    className="btn btn-ghost btn-sm"
                    href={`https://x.com/${desk.profile.xUsername}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    X
                  </a>
                </div>
              </div>
              <div className="desk-rank" aria-label="Follower rank">
                <span>Rank</span>
                <strong>#{desk.profile.rank || '—'}</strong>
              </div>
            </header>

            <div className="desk-stats" aria-label="X stats">
              <div>
                <strong>{formatCount(desk.profile.followers)}</strong>
                <span>Followers</span>
              </div>
              <div>
                <strong>{formatCount(desk.profile.following)}</strong>
                <span>Following</span>
              </div>
              <div>
                <strong>{formatCount(desk.profile.tweetCount)}</strong>
                <span>Posts</span>
              </div>
              <div>
                <strong>{formatWhen(desk.profile.registeredAt)}</strong>
                <span>Joined</span>
              </div>
            </div>

            <section className="desk-pnl" aria-label="CrewPay performance">
              <p className="section-label">Performance</p>
              <p className="desk-pnl-value">
                {formatSol(desk.performance.solReceived)}
                <span> SOL</span>
              </p>
              <p className="desk-pnl-sub">Creator fees paid to this wallet on CrewPay.</p>
              <div className="desk-pnl-chips">
                <span>{desk.performance.coinsHired} hired</span>
                <span>{desk.performance.coinsLaunched} launched</span>
                <span>{desk.performance.remitCount} payments</span>
              </div>
            </section>

            <section className="desk-block">
              <h2 className="section-title desk-block-title">Coins</h2>
              {desk.performance.coins.length === 0 ? (
                <p className="desk-empty">
                  No CrewPay coins yet. When a launch hires this wallet, the coin and the SOL paid
                  show up here.
                </p>
              ) : (
                <div className="desk-coins">
                  {desk.performance.coins.map((coin) => (
                    <article className="desk-coin" key={coin.mint}>
                      <div className="desk-coin-top">
                        <strong>${coin.ticker}</strong>
                        <span>{coin.launchedByKol ? 'Launched' : 'Hired'}</span>
                      </div>
                      <p className="desk-coin-name">{coin.name}</p>
                      <p className="desk-coin-sol">{formatSol(coin.solReceived)} SOL</p>
                      <p className="desk-coin-meta">
                        {coin.share != null ? `${coin.share}% share` : coin.mode}
                        {coin.hireRole ? ` · ${coin.hireRole}` : ''}
                        {' · '}
                        {formatWhen(coin.launchedAt)}
                      </p>
                      <div className="desk-coin-links">
                        {coin.pumpUrl ? (
                          <a href={coin.pumpUrl} target="_blank" rel="noreferrer">
                            Pump
                          </a>
                        ) : null}
                        <a href={`https://solscan.io/token/${coin.mint}`} target="_blank" rel="noreferrer">
                          Mint
                        </a>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="desk-block">
              <h2 className="section-title desk-block-title">Paid</h2>
              {desk.performance.remits.length === 0 ? (
                <p className="desk-empty">No fee payments recorded for this wallet yet.</p>
              ) : (
                <div className="desk-remits">
                  {desk.performance.remits.map((remit) => (
                    <a
                      className="desk-remit"
                      key={`${remit.signature}-${remit.mint}`}
                      href={
                        remit.signature
                          ? `https://solscan.io/tx/${remit.signature}`
                          : `https://solscan.io/token/${remit.mint}`
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      <strong>${remit.ticker}</strong>
                      <span>{formatSol(remit.amountSol)} SOL</span>
                      <span>{remit.mode}</span>
                      <span>{formatWhen(remit.at)}</span>
                    </a>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}
      </section>
    </div>
  )
}
