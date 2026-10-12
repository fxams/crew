import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import bs58 from 'bs58'
import { CREW_VERSION, KOL_REFERRAL_CUT_PCT } from '../lib/config'
import { formatSol } from '../lib/format-sol'
import { useOwnRegisteredHandle } from '../lib/registered-kol'
import { kolProfilePath } from '../lib/routes'

const MCP_PIN = '1.2.6'

const API = (
  (import.meta.env.VITE_CREW_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'https://api.crewpay.dev'
)

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
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  return new Date(t).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
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

/** Mobile browsers without an injected wallet: offer "open in Phantom". */
function phantomBrowseUrl(): string | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { solana?: unknown; phantom?: unknown; backpack?: unknown; solflare?: unknown }
  if (w.solana || w.phantom || w.backpack || w.solflare) return null
  if (!/Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')) return null
  const here = window.location.href
  return `https://phantom.app/ul/browse/${encodeURIComponent(here)}?ref=${encodeURIComponent(window.location.origin)}`
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
  const clean = h.trim().replace(/^@/, '').replace(/^https?:\/\/(x|twitter)\.com\//i, '').split(/[/?#]/)[0]
  const valid = /^[A-Za-z0-9_]{1,15}$/.test(clean)
  return (
    <form
      className="register-lookup"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) navigate(kolProfilePath(clean))
      }}
    >
      <label>
        <span>Already hired? Check your X handle</span>
        <div className="register-lookup-row">
          <input
            type="text"
            value={h}
            onChange={(e) => setH(e.target.value)}
            placeholder="@yourhandle"
            autoComplete="off"
            spellCheck={false}
            maxLength={40}
          />
          <button type="submit" className="btn btn-ghost btn-sm" disabled={!valid}>
            Check
          </button>
        </div>
      </label>
    </form>
  )
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
  const [refInput, setRefInput] = useState(() => normalizeRef(params.get('ref')))
  const [evmWallet, setEvmWallet] = useState('')
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null)
  const ownHandle = useOwnRegisteredHandle(wallet.publicKey?.toBase58())
  const registeredHandle = params.get('registered') === '1' ? params.get('handle') : null
  const deskHandle = registeredHandle || ownHandle
  const alreadyRegistered = Boolean(ownHandle)
  const referralCode = normalizeRef(refInput)
  const showAgentSnippets = referralCode.length >= 2

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

  useEffect(() => {
    const fromUrl = normalizeRef(params.get('ref'))
    if (fromUrl) setRefInput(fromUrl)
  }, [params])

  async function onRegister() {
    if (alreadyRegistered && ownHandle) {
      return
    }
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
          ...(referralCode.length >= 2 ? { referralCode } : {}),
          ...(evmWallet.trim() ? { evmWallet: evmWallet.trim() } : {}),
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
              ← Autohire list
            </Link>
            <p className="section-label">Crew · v{CREW_VERSION}</p>
          </div>
          <h1 className="section-title">
            {showAgentSnippets ? `Code: ${referralCode}` : 'Join the crew.'}
          </h1>
          <p className="section-sub">
            {showAgentSnippets ? (
              <>
                KOLs: register below with this invite. Agent builders: claim a key with{' '}
                <strong>{referralCode}</strong> so referred launches pay the referrer{' '}
                {KOL_REFERRAL_CUT_PCT}% of creator fees (60/15/{KOL_REFERRAL_CUT_PCT}/20 on-chain;
                max 7 crew seats). Buyback cron is not live.
              </>
            ) : (
              <>
                AI agents launch coins on CrewPay and lock 60% to the KOL crew, 15% to the
                launching agent, and 25% to the treasury, on-chain. Registering takes about a
                minute.
              </>
            )}
          </p>
        </div>

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

        {!showAgentSnippets ? (
          <ul className="register-why">
            <li>
              <strong>Hired first.</strong> Autohire fills seats with registered KOLs before anyone else.
            </li>
            <li>
              <strong>Your wallet.</strong> Fee-shares go to the wallet you sign with, not a scraped one.
            </li>
            <li>
              <strong>Referral link.</strong> Agents that claim a key with your code pay you{' '}
              {KOL_REFERRAL_CUT_PCT}% of creator fees on every launch (60/15/{KOL_REFERRAL_CUT_PCT}/20).
            </li>
            <li>
              <strong>Read-only X.</strong> Sign-in only reads your profile. CrewPay can't post or DM as you.
            </li>
            <li className="register-why-note">
              Payouts depend on trading volume of the coins you're hired on, so they can be zero. Buyback cron is not
              live.
            </li>
          </ul>
        ) : null}

        <HiredLookup />

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

          {!alreadyRegistered ? (
            <label className="register-ref">
              <span>Referral code (optional)</span>
              <input
                type="text"
                value={refInput}
                onChange={(e) => setRefInput(e.target.value)}
                placeholder="friendscode"
                autoComplete="off"
                spellCheck={false}
                maxLength={24}
              />
              {referralCode.length >= 2 ? (
                <em>
                  Optional: who referred you as a KOL (points). Agent fee referrals use your
                  desk link crewpay.dev/r/yourcode after you register.
                </em>
              ) : (
                <em>Every registered KOL gets a shareable code on their desk.</em>
              )}
            </label>
          ) : null}

          {!alreadyRegistered ? (
            <label className="register-ref register-evm">
              <span>EVM wallet (optional)</span>
              <input
                type="text"
                value={evmWallet}
                onChange={(e) => setEvmWallet(e.target.value)}
                placeholder="0x… Base address"
                autoComplete="off"
                spellCheck={false}
                maxLength={42}
              />
              <em>
                Needed to be paid on Zora / Base launches. Pump.fun and Bags.fm still pay your
                Solana wallet.
              </em>
            </label>
          ) : null}

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

          {!connected && phantomBrowseUrl() ? (
            <p className="hint register-mobile-hint">
              On a phone without a wallet extension?{' '}
              <a href={phantomBrowseUrl()!}>Open this page in Phantom</a> to connect and sign.
            </p>
          ) : null}
          <div className="register-actions">
            {!connected ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setVisible(true)}>
                Connect wallet
              </button>
            ) : null}
            {alreadyRegistered && ownHandle ? (
              <Link className="btn btn-primary btn-sm" to={kolProfilePath(ownHandle)}>
                Open desk
              </Link>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy || xOauth === false}
                onClick={() => void onRegister()}
              >
                {busy ? 'Waiting for X…' : 'Register with X'}
              </button>
            )}
          </div>
        </div>

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
      </section>
    </div>
  )
}
