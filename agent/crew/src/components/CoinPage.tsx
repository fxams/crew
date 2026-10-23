import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CREW_AGENT_API_URL, CREW_VERSION, SOLSCAN_TX_URL } from '../lib/config'
import { formatUtc } from '../lib/format-utc'
import type { AgentEarnedOnCoin } from '../lib/api'
import {
  agentBoardIdentity,
  formatAgentFees,
  formatPayoutDay,
  hasAgentEarned,
} from '../lib/agent-leaderboard'
import { coinMintFromPath, kolProfilePath } from '../lib/routes'
import { COIN_JOB_TEMPLATES } from '../lib/coin-jobs'
import { loadBoard } from '../lib/store'
import { PlatformBadge } from './PlatformBadge'
import { CoinLogo } from './CoinLogo'
import { inferLaunchPlatform, tradeLabel } from '../lib/platforms'
import { XLink } from './XLink'

type Coin = {
  mint: string
  name: string
  ticker: string
  vibe?: string
  crew: { handle: string; wallet: string; share: number; hireRole?: string }[]
  launcher: string
  pumpUrl: string
  launchedAt: number
  platform?: string
  imageUrl?: string
  twitter?: string
  website?: string
  telegram?: string
  pageUrl?: string
  chain?: string
  launchpadLabel?: string
  signature?: string
}

type Kit = {
  aiCrew?: {
    items: { id: string; caption: string; svg: string; createdAt: number }[]
    note?: string
    humansAreCore?: boolean
  }
  kickoff?: {
    budget?: {
      capSol: number
      capUsd?: number | null
      availableSol: number
      availableUsd?: number | null
      reservedUsd?: number
      treasuryBps: number
      feesGeneratedSol: number
      accruedSol?: number
      source?: string
    }
    extras?: {
      id: string
      label: string
      costUsd: number
      costSol?: number | null
      eligible: boolean
      state: string
      included?: boolean
      priceMayChange?: boolean
      costNote?: string
      href?: string
      fundedAt?: { label: string; progress: number | null; fullyFunded: boolean }
    }[]
    proposals?: { id: string; label: string; status: string; costUsd?: number; costSol: number; payoutStatus?: string }[]
    feeMap?: string
    note?: string
    autoApproveUsd?: number
    nextItem?: {
      id: string
      label: string
      costUsd: number
      fundedAt?: { label: string; progress: number | null; fullyFunded: boolean }
    } | null
    dexscreener?: { met?: boolean; reasons?: string[] }
  }
  featured?: { handle?: string; url?: string | null; at?: number | null; note?: string }
  timeline?: {
    id: string
    label: string
    status: 'done' | 'in-progress' | 'locked'
    at?: number | null
    href?: string
    tx?: string
    detail: string
    fundedAt?: { label: string; progress: number | null; fullyFunded: boolean }
  }[]
  jobs?: {
    enabled?: boolean
    templates?: { id: string; label: string; summary: string }[]
    open?: { id: string; templateId?: string; status: string; budget: number }[]
    note?: string
  }
}

function shortAddr(addr: string) {
  if (!addr || addr.length < 10) return addr || '—'
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`
}

function fmtStamp(ms?: number | null) {
  if (!ms || !Number.isFinite(ms)) return null
  return formatUtc(ms)
}

export function CoinPage() {
  const { pathname } = useLocation()
  const mint = coinMintFromPath(pathname) || ''
  const [coin, setCoin] = useState<Coin | null>(null)
  const [agentEarned, setAgentEarned] = useState<AgentEarnedOnCoin | null>(null)
  const [kit, setKit] = useState<Kit | null>(null)
  const [missing, setMissing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!mint) return
    let cancelled = false
    setMissing(false)
    setError(null)
    ;(async () => {
      try {
        const [coinRes, kitRes] = await Promise.all([
          fetch(`${CREW_AGENT_API_URL}/api/coins/${encodeURIComponent(mint)}`),
          fetch(`${CREW_AGENT_API_URL}/api/coins/${encodeURIComponent(mint)}/kit`),
        ])
        if (cancelled) return
        if (coinRes.ok) {
          const data = (await coinRes.json()) as { coin: Coin; agentEarned?: AgentEarnedOnCoin | null }
          setCoin(data.coin)
          setAgentEarned(hasAgentEarned(data.agentEarned) ? data.agentEarned : null)
        } else if (coinRes.status === 404) {
          const local = loadBoard().coins.find((c) => c.mint === mint)
          setAgentEarned(null)
          if (local) {
            setCoin(local)
          } else {
            setMissing(true)
            setCoin(null)
          }
        } else {
          throw new Error('Could not load coin')
        }
        if (kitRes.ok) {
          setKit((await kitRes.json()) as Kit)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load coin')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mint])

  const platform = inferLaunchPlatform({
    platform: coin?.platform,
    pumpUrl: coin?.pumpUrl,
    mint: coin?.mint,
  })

  const socials = useMemo(() => {
    if (!coin) return []
    const out: { label: string; href: string }[] = []
    if (coin.twitter) out.push({ label: 'X', href: coin.twitter })
    if (coin.website) out.push({ label: 'Site', href: coin.website })
    if (coin.telegram) out.push({ label: 'Telegram', href: coin.telegram })
    return out
  }, [coin])

  async function copyMint() {
    try {
      await navigator.clipboard.writeText(mint)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  if (!mint) return null

  return (
    <div className="app-shell page-coin">
      <section className="section section-coin">
        <div className="launch-page-head-row">
          <Link className="launch-back" to="/coins">
            ← Coins
          </Link>
          <p className="section-label">Coin · v{CREW_VERSION}</p>
        </div>

        {error ? (
          <p className="desk-msg desk-msg-error" role="alert">
            {error}
          </p>
        ) : null}
        {missing ? (
          <p className="section-sub">No CrewPay launch for this mint.</p>
        ) : null}
        {!coin && !missing && !error ? <p className="section-sub">Loading…</p> : null}

        {coin ? (
          <>
            <header className="coin-hero">
              <CoinLogo
                mint={coin.mint || mint}
                ticker={coin.ticker}
                className="coin-hero-img"
                fallbackClassName="coin-hero-img coin-hero-fallback"
                size={88}
              />
              <div className="coin-hero-copy">
                <p className="coin-ticker">${coin.ticker}</p>
                <h1 className="section-title coin-name">{coin.name}</h1>
                <div className="coin-hero-meta">
                  <PlatformBadge platform={platform} pumpUrl={coin.pumpUrl} mint={coin.mint} />
                  <span>{coin.chain || 'solana'}</span>
                </div>
              </div>
            </header>

            <div className="coin-toolbar">
              <div className="coin-ca">
                <span className="hero-token-k">CA</span>
                <code title={mint}>{shortAddr(mint)}</code>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copyMint()}>
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="coin-actions">
                {coin.pumpUrl ? (
                  <a className="btn btn-primary" href={coin.pumpUrl} target="_blank" rel="noreferrer">
                    {tradeLabel(platform)} →
                  </a>
                ) : null}
                {socials.map((s) => (
                  <XLink key={s.href} className="btn btn-ghost" href={s.href}>
                    {s.label}
                  </XLink>
                ))}
              </div>
            </div>

            {hasAgentEarned(agentEarned) ? (
              <div className="coin-panel coin-agent-earned" data-testid="coin-agent-earned">
                <p className="section-label">Agent earned</p>
                <p className="coin-agent-earned-amt">{formatAgentFees(agentEarned)}</p>
                <p className="hint">
                  {agentBoardIdentity(agentEarned).title}
                  {formatPayoutDay(agentEarned.lastPayoutAt)
                    ? ` · last crank ${formatPayoutDay(agentEarned.lastPayoutAt)}`
                    : ''}
                  {agentEarned.remitCount > 0 ? ` · ${agentEarned.remitCount} desk remits` : ''}
                </p>
                {agentEarned.lastPayoutSignature ? (
                  <a
                    className="btn btn-ghost btn-sm"
                    href={SOLSCAN_TX_URL(agentEarned.lastPayoutSignature)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Last payout tx
                  </a>
                ) : null}
              </div>
            ) : null}

            <div className="coin-split">
              {coin.crew?.length ? (
                <div className="coin-panel coin-crew">
                  <p className="section-label">Hired KOL crew</p>
                  <ul>
                    {coin.crew.map((m) => (
                      <li key={`${m.handle}-${m.wallet}`}>
                        <Link to={kolProfilePath(m.handle.replace(/^@/, ''))}>{m.handle}</Link>
                        <span>{m.share}%</span>
                      </li>
                    ))}
                  </ul>
                  <p className="hint">60% of creator fees go to this crew — not the launcher.</p>
                </div>
              ) : null}
              {kit?.timeline?.length ? (
                <ol className="coin-panel coin-timeline" aria-label="Launch milestones">
                  {kit.timeline.map((step) => (
                    <li key={step.id} className={`coin-tl is-${step.status}`}>
                      <span className="coin-tl-mark" aria-hidden />
                      <div className="coin-tl-body">
                        <strong>{step.label}</strong>
                        <em className="coin-tl-state">{step.status.replace('-', ' ')}</em>
                        <p>{step.detail}</p>
                        {step.status === 'done' && fmtStamp(step.at) ? (
                          <small>{fmtStamp(step.at)}</small>
                        ) : null}
                        {step.fundedAt?.progress != null && step.status !== 'done' ? (
                          <span className="kickoff-bar" aria-label={step.fundedAt.label}>
                            <i style={{ width: `${Math.round(step.fundedAt.progress * 100)}%` }} />
                          </span>
                        ) : null}
                        {step.fundedAt?.label && step.status !== 'done' ? (
                          <small className="kickoff-funded-label">{step.fundedAt.label}</small>
                        ) : null}
                        <span className="coin-tl-links">
                          {step.href ? (
                            <XLink href={step.href}>
                              {step.id === 'featured-crewpayhq' && step.status === 'done'
                                ? 'View post'
                                : step.id === 'page-live'
                                  ? 'Open page'
                                  : 'Open'}
                            </XLink>
                          ) : null}
                          {step.tx ? (
                            <a href={step.href} target="_blank" rel="noreferrer">
                              tx {shortAddr(step.tx)}
                            </a>
                          ) : null}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>

            {kit?.aiCrew?.items?.length ? (
              <div className="coin-panel coin-ai">
                <div className="coin-ai-head">
                  <CoinLogo
                    mint={coin.mint || mint}
                    ticker={coin.ticker}
                    className="coin-ai-logo"
                    fallbackClassName="coin-ai-logo coin-ai-logo-fallback"
                    size={32}
                  />
                  <div className="coin-ai-copy">
                    <p className="section-label">AI crew</p>
                    <p className="coin-ai-note">Lightweight AI memes. Humans stay the core.</p>
                  </div>
                </div>
                <ul className="coin-ai-gallery">
                  {kit.aiCrew.items.slice(0, 6).map((item) => (
                    <li key={item.id}>
                      <div
                        className="coin-ai-svg"
                        dangerouslySetInnerHTML={{ __html: item.svg }}
                        title={item.caption}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="coin-ai-empty">AI crew — no memes yet. They show on the next kit refresh.</p>
            )}

            <div className="coin-jobs">
              <p className="section-label">Creative jobs</p>
              <p className="hint">
                One-click templates on jobs + escrow (test/devnet). Agents post with budget; humans
                claim, deliver, get paid after verification. No earnings promises.
              </p>
              <div className="coin-job-grid">
                {(kit?.jobs?.templates?.length
                  ? kit.jobs.templates.map((t) => ({ id: t.id, label: t.label, summary: t.summary }))
                  : COIN_JOB_TEMPLATES
                ).map((t) => (
                  <div className="coin-job-card" key={t.id}>
                    <strong>{t.label}</strong>
                    <span>{t.summary}</span>
                    <code>post_coin_job template={t.id}</code>
                  </div>
                ))}
              </div>
            </div>

            <details className="coin-more">
              <summary>Budget, kickoff extras, and details</summary>
              {kit?.kickoff ? (
                <div className="coin-kickoff">
                  <p className="hint">{kit.kickoff.note}</p>
                  <p className="hint">
                    Fee map: {kit.kickoff.feeMap}. Treasury budget $
                    {kit.kickoff.budget?.availableUsd != null
                      ? kit.kickoff.budget.availableUsd.toFixed(2)
                      : '--'}{' '}
                    remaining of $
                    {kit.kickoff.budget?.capUsd != null ? kit.kickoff.budget.capUsd.toFixed(2) : '--'}{' '}
                    (this coin’s {((kit.kickoff.budget?.treasuryBps || 0) / 100).toFixed(0)}% share).
                    Reserved ${kit.kickoff.budget?.reservedUsd?.toFixed(2) ?? '0.00'}. Auto-approve cap $
                    {kit.kickoff.autoApproveUsd ?? 0} (0 = admin only).
                  </p>
                  <ul className="coin-kickoff-list">
                    {(kit.kickoff.extras || []).map((x) => (
                      <li key={x.id}>
                        <span>
                          {x.label}
                          {x.priceMayChange ? <small> · price may change</small> : null}
                          <small className="kickoff-funded-label">{x.fundedAt?.label || x.state}</small>
                          {!x.included && x.fundedAt?.progress != null ? (
                            <span className="kickoff-bar" aria-hidden>
                              <i style={{ width: `${Math.round(x.fundedAt.progress * 100)}%` }} />
                            </span>
                          ) : null}
                        </span>
                        <em>{x.included ? 'Included' : `$${x.costUsd} · ${x.state}`}</em>
                      </li>
                    ))}
                  </ul>
                  <Link className="btn btn-ghost btn-sm" to="/admin/kickoff">
                    Admin queue
                  </Link>
                </div>
              ) : null}
              {coin.vibe ? <p className="hint">{coin.vibe}</p> : null}
              <p className="hint">
                Launcher {shortAddr(coin.launcher)}
                {coin.signature ? ` · tx ${shortAddr(coin.signature)}` : ''}
              </p>
            </details>
          </>
        ) : null}
      </section>
    </div>
  )
}
