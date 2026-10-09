import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import bs58 from 'bs58'
import { CREW_VERSION } from '../lib/config'
import { kolProfilePath } from '../lib/routes'

const API = (
  (import.meta.env.VITE_CREW_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'https://api.crewpay.dev'
)

type Registration = {
  xUserId: string
  xUsername: string
  xName: string
  xVerified: boolean
  followers: number
  following: number
  tweetCount: number
  wallet: string
  registeredAt: string
  rank: number
  description: string
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
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  return new Date(t).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function KolRegisterPage() {
  const wallet = useWallet()
  const { setVisible } = useWalletModal()
  const [params] = useSearchParams()
  const [board, setBoard] = useState<Registration[]>([])
  const [tape, setTape] = useState<Registration[]>([])
  const [total, setTotal] = useState(0)
  const [xOauth, setXOauth] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(params.get('error'))
  const [ownHandle, setOwnHandle] = useState<string | null>(null)
  const registeredHandle = params.get('registered') === '1' ? params.get('handle') : null
  const deskHandle = registeredHandle || ownHandle

  const load = useCallback(async () => {
    const [statusRes, boardRes] = await Promise.all([
      fetch(`${API}/api/kols/register/status`),
      fetch(`${API}/api/kols/registered?limit=40`),
    ])
    if (statusRes.ok) {
      const status = (await statusRes.json()) as { xOauth?: boolean }
      setXOauth(Boolean(status.xOauth))
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

  const connectedWallet = wallet.publicKey?.toBase58() || ''
  useEffect(() => {
    if (!connectedWallet) {
      setOwnHandle(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`${API}/api/kols/registered/wallet/${encodeURIComponent(connectedWallet)}`)
        if (!res.ok) return
        const body = (await res.json()) as { profile?: { xUsername?: string } }
        if (!cancelled && body.profile?.xUsername) setOwnHandle(body.profile.xUsername)
      } catch {
        /* desk link is optional */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [connectedWallet])

  async function onRegister() {
    setError(null)
    if (!wallet.publicKey || !wallet.signMessage) {
      setVisible(true)
      setError('Connect a Solana wallet that can sign messages.')
      return
    }
    setBusy(true)
    try {
      const pubkey = wallet.publicKey.toBase58()
      const nonceRes = await fetch(`${API}/api/kols/register/nonce`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ wallet: pubkey }),
      })
      const nonceBody = (await nonceRes.json()) as { message?: string; error?: string }
      if (!nonceRes.ok || !nonceBody.message) {
        throw new Error(nonceBody.error || 'Could not start registration.')
      }
      const sigBytes = await wallet.signMessage(new TextEncoder().encode(nonceBody.message))
      const startRes = await fetch(`${API}/api/kols/register/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          wallet: pubkey,
          message: nonceBody.message,
          signature: bs58.encode(sigBytes),
        }),
      })
      const startBody = (await startRes.json()) as { authorizeUrl?: string; error?: string }
      if (!startRes.ok || !startBody.authorizeUrl) {
        throw new Error(startBody.error || 'X sign-in did not start.')
      }
      window.location.assign(startBody.authorizeUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.')
      setBusy(false)
    }
  }

  const connected = Boolean(wallet.publicKey)

  return (
    <div className="app-shell page-kols page-register">
      <section className="section section-kols">
        <div className="kols-page-head">
          <div className="launch-page-head-row">
            <Link className="launch-back" to="/kols">
              ← Directory
            </Link>
            <p className="section-label">Register · v{CREW_VERSION}</p>
          </div>
          <h1 className="section-title">KOL registration.</h1>
          <p className="section-sub">
            Sign in with X and link a Solana wallet. Followers, posts, and verified status come
            from your X account. Rank is followers, highest first.
          </p>
        </div>

        <div className="register-card">
          <ol className="register-steps">
            <li className={connected ? 'is-done' : ''}>
              <strong>1. Solana wallet</strong>
              <span>{connected ? shortAddr(wallet.publicKey!.toBase58()) : 'Required'}</span>
            </li>
            <li>
              <strong>2. Sign the link</strong>
              <span>Proves you control the address</span>
            </li>
            <li>
              <strong>3. X account</strong>
              <span>{xOauth === false ? 'Waiting on X app credentials' : 'Followers + stats'}</span>
            </li>
          </ol>

          {deskHandle ? (
            <p className="register-ok">
              @{deskHandle} is on the board.{' '}
              <Link to={kolProfilePath(deskHandle)}>Open desk</Link>
            </p>
          ) : null}
          {error ? <p className="register-err">{error}</p> : null}
          {xOauth === false ? (
            <p className="register-err">
              X sign-in is not configured on the API yet (X_CLIENT_ID / X_CLIENT_SECRET). The board below still works.
            </p>
          ) : null}

          <div className="register-actions">
            {!connected ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setVisible(true)}>
                Connect wallet
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy || xOauth === false}
              onClick={() => void onRegister()}
            >
              {busy ? 'Waiting for X…' : 'Register with X'}
            </button>
          </div>
        </div>

        <div className="register-tape" aria-label="Registration tape">
          <p className="section-label">Tape · {total} registered</p>
          {tape.length === 0 ? (
            <p className="section-sub">No KOLs registered yet.</p>
          ) : (
            <div className="register-tape-track">
              {tape.map((row) => (
                <Link
                  className="register-tape-item"
                  key={`tape-${row.xUserId}`}
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
        <p className="section-sub">Ranked by X follower count.</p>
        <div className="kols-table kols-table-register" role="table" aria-label="Registered KOL leaderboard">
          <div className="kols-row kols-row-head kols-row-register" role="row">
            <span role="columnheader">#</span>
            <span role="columnheader">X</span>
            <span role="columnheader">Followers</span>
            <span role="columnheader">Posts</span>
            <span role="columnheader">Wallet</span>
          </div>
          {board.map((row) => (
            <div className="kols-row kols-row-register" role="row" key={row.xUserId}>
              <span className="kols-rank" role="cell">
                {row.rank || '—'}
              </span>
              <span className="kols-identity" role="cell">
                <Link to={kolProfilePath(row.xUsername)}>
                  @{row.xUsername}
                  {row.xVerified ? ' ✓' : ''}
                </Link>
                <span className="kols-pump">{row.xName}</span>
              </span>
              <span className="kols-foll" role="cell">
                {formatFollowers(row.followers)}
              </span>
              <span className="kols-foll" role="cell">
                {formatFollowers(row.tweetCount)}
              </span>
              <span className="kols-wallet" role="cell" title={row.wallet}>
                {shortAddr(row.wallet)}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
