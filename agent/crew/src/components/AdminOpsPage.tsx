import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import bs58 from 'bs58'
import { CREW_AGENT_API_URL, CREW_VERSION } from '../lib/config'
import { formatSol } from '../lib/format-sol'
import { formatUtc } from '../lib/format-utc'
import { adminSecretFromSearch, farcasterAdminHeaders } from '../lib/neynar-siwn'
import { useConnectModal } from './ConnectModal'

export type OpsSnapshot = {
  ok: boolean
  generatedAt: number
  header: {
    totalFeesEarnedSol: number | null
    kolPayoutsSol: number | null
    registeredKols: number
    kolDirectorySize: number
    signupsTotal: number
    signups24h: number
    signupsBySrc: Record<string, number>
    signupsBySrc24h: Record<string, number>
    coinsLaunched: number | null
    feeShareLocked: number | null
    custodialActions: number
  }
  roles: { id: string; label: string; lastActivityAt: number | null }[]
  flow: {
    windowDays: number
    channels: Record<string, number>
    recentHires: number
    recentTasks: number
    kolCrewSeats: number
  }
  money: {
    feeSplit: {
      crew60Sol: number | null
      desk15Sol: number | null
      treasury25Sol: number | null
      note: string
    }
    treasury: { wallet: string | null; balanceSol: number | null }
    pendingFees: {
      mint: string
      unclaimedSol: number | null
      unclaimedEth: number | null
      accruedSol: number
      at: number
      source: string
    }[]
  }
  jobs: {
    enabled: boolean
    open: { id: string; status: string; mode: string; title?: string; mint?: string; deadline: number; escrowRef: string | null }[]
    counts: Record<string, number> | null
    rail?: string
  }
  acp: {
    enabled: boolean
    inProcess: boolean
    chainId: number | null
    listenerStarted: boolean
    x402Enabled: boolean
  }
  log: { at: number; kind: string; text: string }[]
}

function na<T>(v: T | null | undefined, fmt: (x: T) => string): string {
  if (v == null || (typeof v === 'number' && Number.isNaN(v))) return 'n/a'
  return fmt(v)
}

function fmtSol(v: number | null | undefined) {
  return na(v, (n) => `${formatSol(n)} SOL`)
}

function fmtTime(ms: number | null | undefined) {
  return na(ms, (n) => formatUtc(n))
}

function roleGlyph(id: string): string {
  const map: Record<string, string> = {
    scout: '◉',
    poster: '▣',
    dm: '◎',
    monitor: '◈',
    you: '◇',
  }
  return map[id] || '○'
}

function FlowDiagram({ flow }: { flow: OpsSnapshot['flow'] }) {
  const channels = [
    { key: 'mcp', label: 'MCP', color: '#5eead4' },
    { key: 'acp', label: 'ACP', color: '#c084fc' },
    { key: 'x402', label: 'x402', color: '#fb7185' },
    { key: 'elizaos', label: 'ElizaOS', color: '#fbbf24' },
    { key: 'direct', label: 'Direct / site', color: '#94a3b8' },
  ]
  const maxW = Math.max(1, ...channels.map((c) => flow.channels[c.key] || 0), flow.recentHires, flow.kolCrewSeats)

  return (
    <div className="ops-flow" aria-label="Agent flow">
      <div className="ops-flow-col">
        <p className="ops-flow-label">AGENTS</p>
        {channels.map((c) => {
          const w = flow.channels[c.key] || 0
          const pct = Math.max(8, Math.round((w / maxW) * 100))
          return (
            <div className="ops-flow-node" key={c.key} style={{ borderLeftColor: c.color }}>
              <span className="ops-flow-node-title">{c.label}</span>
              <span className="ops-flow-node-meta">{w} launches / {flow.windowDays}d</span>
              <div className="ops-flow-bar" style={{ width: `${pct}%`, background: c.color }} />
            </div>
          )
        })}
      </div>
      <div className="ops-flow-hub" aria-hidden>
        <svg className="ops-flow-svg" viewBox="0 0 320 200" preserveAspectRatio="none">
          {channels.map((c, i) => (
            <path
              key={c.key}
              className="ops-flow-line"
              d={`M 20 ${30 + i * 40} C 120 ${30 + i * 40}, 200 100, 160 100`}
              stroke={c.color}
              strokeWidth={1 + (flow.channels[c.key] || 0) / maxW}
              fill="none"
            />
          ))}
          {channels.map((c, i) => (
            <path
              key={`${c.key}-out`}
              className="ops-flow-line ops-flow-line-out"
              d={`M 160 100 C 200 100, 240 ${40 + (i % 2) * 80}, 300 ${40 + (i % 2) * 80}`}
              stroke={c.color}
              strokeWidth={0.8 + (flow.recentHires / maxW) * 2}
              fill="none"
            />
          ))}
        </svg>
        <div className="ops-flow-core">
          <span className="ops-flow-core-title">CrewPay</span>
          <span className="ops-flow-core-meta">{flow.recentHires} hires · 7d</span>
          <span className="ops-flow-core-meta">{flow.recentTasks} tasks · 7d</span>
        </div>
      </div>
      <div className="ops-flow-col ops-flow-col-right">
        <p className="ops-flow-label">KOL CREWS</p>
        <div className="ops-flow-node ops-flow-node-crew">
          <span className="ops-flow-node-title">Seats locked</span>
          <span className="ops-flow-node-meta">{flow.kolCrewSeats} crew wallets</span>
        </div>
      </div>
    </div>
  )
}

function applyNoindex(): () => void {
  document.title = 'Ops — CREW'
  let meta = document.querySelector('meta[name="robots"]')
  const created = !meta
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'robots')
    document.head.appendChild(meta)
  }
  const prev = meta.getAttribute('content')
  meta.setAttribute('content', 'noindex, nofollow')
  return () => {
    if (created) meta?.remove()
    else if (prev) meta?.setAttribute('content', prev)
    else meta?.remove()
  }
}

export function AdminOpsPage() {
  const [params] = useSearchParams()
  const fromUrl = useMemo(() => adminSecretFromSearch(params.toString()), [params])
  const [token, setToken] = useState(fromUrl.token)
  const wallet = useWallet()
  const { open } = useConnectModal()
  const [data, setData] = useState<OpsSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [authMode, setAuthMode] = useState<'token' | 'wallet'>('token')

  useEffect(() => applyNoindex(), [])

  const signedHeaders = useCallback(async () => {
    if (!wallet.publicKey || !wallet.signMessage) throw new Error('Connect an approver wallet')
    const ts = Date.now()
    const msg = `crew-ops-admin:${ts}`
    const sig = await wallet.signMessage(new TextEncoder().encode(msg))
    return {
      'x-crew-wallet': wallet.publicKey.toBase58(),
      'x-crew-timestamp': String(ts),
      'x-crew-signature': bs58.encode(sig),
    }
  }, [wallet])

  const load = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      let headers: Record<string, string> = {}
      if (authMode === 'wallet') {
        headers = await signedHeaders()
      } else {
        const t = token.trim()
        if (!t) throw new Error('Admin token required (?token=…) or switch to wallet auth')
        headers = farcasterAdminHeaders({ token: t })
      }
      const res = await fetch(`${CREW_AGENT_API_URL}/api/admin/ops`, { headers })
      const json = (await res.json()) as OpsSnapshot & { error?: string }
      if (!res.ok || json.ok === false) throw new Error(json.error || 'Unauthorized')
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed')
    } finally {
      setBusy(false)
    }
  }, [authMode, signedHeaders, token])

  useEffect(() => {
    if (fromUrl.token) setToken(fromUrl.token)
  }, [fromUrl.token])

  useEffect(() => {
    if (!data) return
    const id = window.setInterval(() => void load(), 30_000)
    return () => window.clearInterval(id)
  }, [data, load])

  const clock = formatUtc(Date.now())

  return (
    <div className="admin-ops app-shell">
      <header className="ops-head">
        <div>
          <p className="ops-kicker">
            <span className="ops-dot" aria-hidden /> night ops · v{CREW_VERSION}
          </p>
          <h1 className="ops-title">CrewPay ops</h1>
          <p className="ops-sub">Read-only · real tape · {clock}</p>
        </div>
        <div className="ops-head-profit">
          <p className="ops-profit">{fmtSol(data?.header.totalFeesEarnedSol)}</p>
          <p className="ops-profit-sub">fees distributed · treasury {fmtSol(data?.money.treasury.balanceSol)}</p>
        </div>
      </header>

      <div className="ops-auth">
        <label className="ops-auth-label">
          <span>Admin token</span>
          <input
            className="ops-auth-input"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ADMIN_TOKEN"
            disabled={authMode === 'wallet'}
          />
        </label>
        <div className="ops-auth-actions">
          <button
            type="button"
            className={`btn btn-ghost ops-btn${authMode === 'token' ? ' is-active' : ''}`}
            onClick={() => setAuthMode('token')}
          >
            Token
          </button>
          <button
            type="button"
            className={`btn btn-ghost ops-btn${authMode === 'wallet' ? ' is-active' : ''}`}
            onClick={() => setAuthMode('wallet')}
          >
            Wallet
          </button>
          {authMode === 'wallet' && !wallet.publicKey ? (
            <button type="button" className="btn btn-primary" onClick={() => open()}>
              Connect
            </button>
          ) : (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void load()}>
              {busy ? 'Loading…' : data ? 'Refresh' : 'Load'}
            </button>
          )}
        </div>
        <Link className="ops-back" to="/">← Public site</Link>
      </div>

      {error ? (
        <p className="desk-msg desk-msg-error" role="alert">{error}</p>
      ) : null}

      {data ? (
        <>
          <section className="ops-stats" aria-label="Header metrics">
            <div className="ops-stat">
              <span className="ops-stat-val">{fmtSol(data.header.kolPayoutsSol)}</span>
              <span className="ops-stat-label">KOL payouts</span>
            </div>
            <div className="ops-stat">
              <span className="ops-stat-val">{data.header.registeredKols}</span>
              <span className="ops-stat-label">registered KOLs</span>
            </div>
            <div className="ops-stat">
              <span className="ops-stat-val">{data.header.signups24h}</span>
              <span className="ops-stat-label">sign-ups 24h</span>
            </div>
            <div className="ops-stat">
              <span className="ops-stat-val">{data.header.signupsTotal}</span>
              <span className="ops-stat-label">sign-ups total</span>
            </div>
            <div className="ops-stat">
              <span className="ops-stat-val">{na(data.header.coinsLaunched, String)}</span>
              <span className="ops-stat-label">coins launched</span>
            </div>
            <div className="ops-stat ops-stat-safe">
              <span className="ops-stat-val">{data.header.custodialActions}</span>
              <span className="ops-stat-label">custodial actions</span>
            </div>
          </section>

          <div className="ops-pills">
            {Object.entries(data.header.signupsBySrc24h).map(([src, n]) => (
              <span className="ops-pill" key={src}>
                {src} {n} · 24h
              </span>
            ))}
            <span className="ops-pill ops-pill-warn">
              tg_bot {data.header.signupsBySrc.tg_bot ?? 0} total
            </span>
            <span className="ops-pill">
              jobs {data.jobs.enabled ? 'on' : 'off'}
            </span>
            <span className="ops-pill">
              acp {data.acp.listenerStarted ? 'listening' : data.acp.enabled ? 'enabled' : 'off'}
            </span>
          </div>

          <section className="ops-roles" aria-label="Roles">
            {data.roles.map((r) => (
              <div className="ops-role" key={r.id}>
                <span className="ops-role-icon" aria-hidden>{roleGlyph(r.id)}</span>
                <span className="ops-role-name">{r.label}</span>
                <span className="ops-role-time">{fmtTime(r.lastActivityAt)}</span>
              </div>
            ))}
          </section>

          <FlowDiagram flow={data.flow} />

          <div className="ops-lower">
            <section className="ops-money" aria-label="Money panel">
              <h2 className="ops-panel-title">Money</h2>
              <table className="ops-table">
                <tbody>
                  <tr>
                    <th>60% crew</th>
                    <td>{fmtSol(data.money.feeSplit.crew60Sol)}</td>
                  </tr>
                  <tr>
                    <th>15% desk</th>
                    <td>{fmtSol(data.money.feeSplit.desk15Sol)}</td>
                  </tr>
                  <tr>
                    <th>25% treasury</th>
                    <td>{fmtSol(data.money.feeSplit.treasury25Sol)}</td>
                  </tr>
                  <tr>
                    <th>Treasury wallet</th>
                    <td className="ops-mono">{data.money.treasury.wallet || 'n/a'}</td>
                  </tr>
                </tbody>
              </table>
              <h3 className="ops-panel-sub">Pending fees</h3>
              <ul className="ops-pending">
                {data.money.pendingFees.length === 0 ? (
                  <li className="ops-pending-empty">n/a — accrual cache empty</li>
                ) : (
                  data.money.pendingFees.map((p) => (
                    <li key={p.mint}>
                      <span className="ops-mono">{p.mint.slice(0, 6)}…</span>
                      {' '}
                      {fmtSol(p.unclaimedSol)}
                    </li>
                  ))
                )}
              </ul>
            </section>

            <section className="ops-jobs" aria-label="Tasks and escrow">
              <h2 className="ops-panel-title">Tasks / escrow</h2>
              <p className="ops-panel-meta">
                JOBS_ENABLED={data.jobs.enabled ? 'true' : 'false'}
                {data.jobs.rail ? ` · rail ${data.jobs.rail}` : ''}
              </p>
              {data.jobs.enabled ? (
                <ul className="ops-job-list">
                  {data.jobs.open.length === 0 ? (
                    <li>n/a open jobs</li>
                  ) : (
                    data.jobs.open.map((j) => (
                      <li key={j.id}>
                        {j.status} · {j.title || j.id}
                        {j.escrowRef ? ` · escrow ${j.escrowRef.slice(0, 8)}…` : ''}
                      </li>
                    ))
                  )}
                </ul>
              ) : (
                <p className="ops-panel-meta">Jobs API not mounted.</p>
              )}
              <p className="ops-panel-meta">
                ACP in-process {data.acp.inProcess ? 'yes' : 'no'} · listener{' '}
                {data.acp.listenerStarted ? 'started' : 'stopped'} · x402{' '}
                {data.acp.x402Enabled ? 'on' : 'off'}
              </p>
            </section>
          </div>

          <footer className="ops-log" aria-live="polite">
            {data.log[0] ? (
              <span>
                {fmtTime(data.log[0].at)} · {data.log[0].kind} · {data.log[0].text}
              </span>
            ) : (
              <span>n/a — no recent events</span>
            )}
          </footer>
        </>
      ) : null}
    </div>
  )
}
