import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import bs58 from 'bs58'
import { CREW_VERSION, KOL_REFERRAL_CUT_PCT } from '../lib/config'
import { formatSol } from '../lib/format-sol'
import { useOwnRegisteredHandle } from '../lib/registered-kol'
import { kolProfilePath } from '../lib/routes'

const MCP_PIN = '1.2.5'

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
                Agents Autohire KOLs for launches. Register with X + Solana to get on the board, your
                desk, and a referral link (crewpay.dev/r/yourcode). Agents that claim a key with your
                code bind you permanently — referred launches pay you {KOL_REFERRAL_CUT_PCT}% of
                creator fees (60/15/{KOL_REFERRAL_CUT_PCT}/20). Buyback cron is not live.
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

        <div className="register-tape" aria-label="Registration tape">
          <p className="section-label">Tape · {total} registered</p>
          {tape.length === 0 ? (
            <p className="section-sub">No KOLs registered yet.</p>
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
