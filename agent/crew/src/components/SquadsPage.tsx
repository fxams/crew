import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import { useAccount, useDisconnect } from 'wagmi'
import { ConnectButton } from './ConnectButton'
import { useWalletAuth } from './WalletAuthProvider'
import { XLink } from './XLink'
import { CREW_VERSION, PUMP_COIN_URL, SQUADS_ENABLED } from '../lib/config'
import { formatUtc, formatUtcCountdown, leaksNonUtcZone } from '../lib/format-utc'
import { persistExplicitDisconnect } from '../lib/wallet-session'
import { shortAddr } from '../lib/wallet'
import {
  SQUADS_COLLECTING,
  SQUADS_LIVE_COPY_NOTE,
  SQUADS_PRESTART_BADGE,
  copySignalsOf,
  fetchSquadsCopy,
  fetchSquadsDashboard,
  formatHoldMin,
  formatPct,
  formatUsd,
  formatUsdSigned,
  formatWhen,
  freshWallets,
  isCapitalFlowsCollecting,
  isMomentumCollecting,
  isMomentumWindowEmpty,
  isSquadsFeedStale,
  isSquadsPreStart,
  isWalletAgeCollecting,
  paperCopyBlocked,
  paperCopyScoreAfterFees,
  publicMemberLabel,
  readLocalKillSwitch,
  resolveSquadLabel,
  sharedFunders,
  squadNameById,
  squadsDisclaimer,
  squadsDisputeContact,
  squadsMethodologyUrl,
  squadsRefreshMs,
  writeLocalKillSwitch,
  xHandleHref,
  type CopySignal,
  type PaperStrategy,
  type SquadAnomalyFlag,
  type SquadClosedPosition,
  type SquadOpenPosition,
  type SquadRow,
  type SquadsCopyFeed,
  type SquadsDashboard,
} from '../lib/squads'

function SourceTip({ source }: { source?: string | null }) {
  if (!source) return null
  return (
    <span className="squads-source" title={source} aria-label={source}>
      i
    </span>
  )
}

function Collecting() {
  return <span className="squads-collecting">{SQUADS_COLLECTING}</span>
}

function Money({ n, signed = false }: { n: number | null | undefined; signed?: boolean }) {
  const cls = n == null ? '' : n > 0 ? 'is-pos' : n < 0 ? 'is-neg' : ''
  return <span className={cls}>{signed ? formatUsdSigned(n) : formatUsd(n)}</span>
}

function WalletLink({ wallet }: { wallet?: string | null }) {
  if (!wallet) return <span>—</span>
  return (
    <a href={`https://solscan.io/account/${wallet}`} target="_blank" rel="noreferrer">
      {shortAddr(wallet)}
    </a>
  )
}

function TokenLink({ mint, symbol }: { mint?: string | null; symbol?: string | null }) {
  const label = symbol || (mint ? shortAddr(mint) : '—')
  if (!mint) return <span>{label}</span>
  return (
    <a href={PUMP_COIN_URL(mint)} target="_blank" rel="noreferrer">
      {label}
    </a>
  )
}

function MemberPublic({ member }: { member: { username?: string | null; x_handle?: string | null; wallet?: string | null } }) {
  const label = publicMemberLabel(member)
  const href = xHandleHref(member.x_handle || member.username)
  return (
    <span className="squads-member">
      {href ? (
        <XLink href={href}>@{label}</XLink>
      ) : (
        <span>@{label}</span>
      )}
      {member.wallet ? (
        <>
          {' '}
          <WalletLink wallet={member.wallet} />
        </>
      ) : null}
    </span>
  )
}

function MethodologyLink({ href }: { href: string }) {
  return (
    <a className="squads-method" href={href} target="_blank" rel="noreferrer">
      Methodology
    </a>
  )
}

function EvidenceBlock({ flag, names }: { flag: SquadAnomalyFlag; names: Map<string, string> }) {
  const ev = flag.evidence || {}
  const other = typeof ev.other_squad === 'string' ? resolveSquadLabel(ev.other_squad, names) : null
  const sample = Array.isArray(ev.sample) ? ev.sample.slice(0, 4) : []
  return (
    <div className="squads-evidence">
      <p className="squads-flag-head">
        <strong>{(flag.type || 'flag').replace(/_/g, ' ')}</strong>
        {flag.label ? <span className="muted"> · {flag.label}</span> : null}
        {flag.score != null ? <span className="muted"> · {flag.score.toFixed(2)}</span> : null}
      </p>
      {flag.token ? (
        <p>
          Token <TokenLink mint={flag.token} symbol={null} />
        </p>
      ) : null}
      {flag.wallets?.length ? (
        <p>
          Wallets{' '}
          {flag.wallets.map((w, i) => (
            <span key={`${w}-${i}`}>
              {i ? ', ' : ''}
              <WalletLink wallet={w} />
            </span>
          ))}
        </p>
      ) : null}
      {other ? <p>Other squad {other}</p> : null}
      {typeof ev.same_minute_events === 'number' ? <p>Same-minute events {ev.same_minute_events}</p> : null}
      {typeof ev.mints === 'number' ? <p>Mints {ev.mints}</p> : null}
      {typeof ev.usd === 'number' ? <p>USD {formatUsd(ev.usd)}</p> : null}
      {typeof ev.count === 'number' ? <p>Count {ev.count}</p> : null}
      {sample.length ? (
        <ul>
          {sample.map((row, i) => {
            const item = row as { mint?: string; side?: string; wallets?: string[]; ts?: number }
            return (
              <li key={i}>
                {item.side || 'trade'} <TokenLink mint={item.mint} symbol={null} />{' '}
                {(item.wallets || []).map((w) => shortAddr(w)).join(' · ')}{' '}
                {item.ts ? formatWhen(item.ts) : ''}
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

function PositionsTable({
  rows,
  kind,
}: {
  rows: Array<SquadOpenPosition | SquadClosedPosition>
  kind: 'open' | 'closed'
}) {
  if (!rows.length) return <p className="muted">None in the latest window.</p>
  return (
    <div className="squads-scroll">
      <table className="squads-mini">
        <thead>
          <tr>
            <th>Token</th>
            <th>PnL</th>
            {kind === 'open' ? <th>Supply</th> : <th>Hold</th>}
            <th>Spend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => {
            const open = p as SquadOpenPosition
            const closed = p as SquadClosedPosition
            return (
              <tr key={`${p.mint || i}`}>
                <td>
                  <TokenLink mint={p.mint} symbol={p.symbol} />
                  {p.graduated ? <span className="squads-pill">grad</span> : null}
                </td>
                <td>
                  <Money n={kind === 'open' ? open.upnl_usd : closed.realized_usd} signed />
                </td>
                <td>
                  {kind === 'open'
                    ? open.supply_share_pct != null
                      ? `${open.supply_share_pct.toFixed(2)}%`
                      : '—'
                    : formatHoldMin(closed.hold_min)}
                </td>
                <td>{formatUsd(p.buy_spend_usd)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function EquityCurve({ points }: { points: Array<[string, number]> }) {
  if (!points.length) return <p className="muted">No paper equity points yet.</p>
  const w = 320
  const h = 88
  const ys = points.map((p) => p[1])
  const min = Math.min(...ys, 0)
  const max = Math.max(...ys, 0)
  const span = max - min || 1
  const pad = 6
  const coords = points.map((p, i) => {
    const x = pad + (i / Math.max(points.length - 1, 1)) * (w - pad * 2)
    const y = pad + (1 - (p[1] - min) / span) * (h - pad * 2)
    return `${x},${y}`
  })
  const last = points[points.length - 1]?.[1]
  return (
    <div className="squads-curve" aria-label="Paper equity curve">
      <svg viewBox={`0 0 ${w} ${h}`} role="img">
        <polyline fill="none" stroke="currentColor" strokeWidth="2" points={coords.join(' ')} />
      </svg>
      <p className="muted">
        Last {formatUsdSigned(last)} after fees · {points.length} marks
      </p>
    </div>
  )
}

function StrategyScore({ name, strat }: { name: string; strat: PaperStrategy }) {
  const score = paperCopyScoreAfterFees(strat)
  return (
    <div className="squads-strat">
      <strong>{name}</strong>
      <span>
        Paper copy score after fees <Money n={score} signed />
      </span>
      <span className="muted">
        Realized {formatUsdSigned(strat.realized_usd ?? strat.pnl_usd)} · open MTM{' '}
        {formatUsdSigned(strat.open_mtm_usd)} · win {formatPct(strat.win_rate)} · staked{' '}
        {formatUsd(strat.staked_usd)}
      </span>
      {strat.equity_curve?.length ? <EquityCurve points={strat.equity_curve} /> : null}
    </div>
  )
}

export function SquadsPage() {
  const wallet = useWallet()
  const { address: evmAddress } = useAccount()
  const { disconnectAsync: disconnectEvm } = useDisconnect()
  const { logout } = useWalletAuth()
  const [feed, setFeed] = useState<SquadsDashboard | null>(null)
  const [copyFeed, setCopyFeed] = useState<SquadsCopyFeed | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [picked, setPicked] = useState('')
  const [localKill, setLocalKill] = useState(() => readLocalKillSwitch())
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async (signal?: AbortSignal) => {
    setError(null)
    try {
      const next = await fetchSquadsDashboard(signal)
      setFeed(next)
      setNow(Date.now())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Squads feed unavailable')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!SQUADS_ENABLED) return
    const ctrl = new AbortController()
    void load(ctrl.signal)
    return () => ctrl.abort()
  }, [load])

  useEffect(() => {
    if (!SQUADS_ENABLED || !feed) return
    const ms = squadsRefreshMs(feed.refresh_seconds)
    const id = window.setInterval(() => {
      void load()
    }, ms)
    return () => window.clearInterval(id)
  }, [feed, load])

  useEffect(() => {
    if (!SQUADS_ENABLED || !picked) return
    const ctrl = new AbortController()
    void fetchSquadsCopy(picked, ctrl.signal)
      .then((next) => {
        if (!ctrl.signal.aborted) setCopyFeed(next)
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setCopyFeed(null)
      })
    return () => ctrl.abort()
  }, [picked])

  const names = useMemo(() => squadNameById(feed?.squads), [feed])
  const methodology = squadsMethodologyUrl(feed)
  const disclaimer = squadsDisclaimer(feed)
  const dispute = squadsDisputeContact(feed)
  const prestart = isSquadsPreStart(feed?.status)
  const stale = isSquadsFeedStale(feed?.updated_at, now)
  const contestStart = feed?.competition?.start
  const contestEnd = feed?.competition?.end
  const startLeft = formatUtcCountdown(contestStart, now)
  const endLeft = formatUtcCountdown(contestEnd, now)
  const publicNotes = (feed?.notes || []).filter((n) => !leaksNonUtcZone(n))
  const paper = feed?.paper_copy
  const feedKill = Boolean(paper?.kill_switch_engaged)
  const copyOff = paperCopyBlocked({
    mode: paper?.mode ?? copyFeed?.mode,
    mainnet_available: paper?.mainnet_available ?? copyFeed?.mainnet_available,
    kill_switch_engaged: paper?.kill_switch_engaged ?? copyFeed?.kill_switch_engaged,
    localKill,
  })
  const killEngaged = localKill || feedKill
  const squads = feed?.squads || []
  const pickedSquad = squads.find((s) => s.id === picked || s.name === picked) || null
  const signals: CopySignal[] = (copyFeed ? copySignalsOf(copyFeed) : feed?.copy_signals) || []
  const filteredSignals = picked
    ? signals.filter((s) => s.squad_id === picked || s.squad === picked || s.squad === pickedSquad?.name)
    : signals
  const strategies = pickedSquad?.paper_copy?.strategies || {}
  const overlapFresh = freshWallets(squads)
  const overlapFunders = sharedFunders(squads)
  const connected = Boolean(wallet.publicKey || evmAddress)

  async function onDisconnect() {
    try {
      await logout()
    } catch {
      /* ignore */
    }
    try {
      await persistExplicitDisconnect()
    } catch {
      /* ignore */
    }
    try {
      await wallet.disconnect()
    } catch {
      /* ignore */
    }
    try {
      wallet.select(null)
    } catch {
      /* ignore */
    }
    try {
      await disconnectEvm()
    } catch {
      /* ignore */
    }
  }

  function toggleKill(next: boolean) {
    setLocalKill(next)
    writeLocalKillSwitch(next)
  }

  if (!SQUADS_ENABLED) {
    return (
      <div className="app-shell page-squads">
        <section className="section section-squads">
          <p className="section-sub">Squads is not enabled on this build.</p>
          <Link className="btn btn-ghost btn-sm" to="/">
            Home
          </Link>
        </section>
      </div>
    )
  }

  return (
    <div className="app-shell page-squads">
      <section className="section section-squads">
        <div className="launch-page-head-row">
          <Link className="launch-back" to="/">
            ← Home
          </Link>
          <p className="section-label">Squads · v{CREW_VERSION}</p>
        </div>
        <h1 className="section-title">{feed?.competition?.name || 'Squad Invitational'}</h1>
        <p className="section-sub">
          Public pump.fun squad board. Wallets and public pump.fun usernames or X handles only. No
          earnings promises. Data from{' '}
          <a href="upstream-feed target="_blank" rel="noreferrer">
            upstream-feed
          </a>
          , refreshed every 10 minutes.
        </p>

        {prestart ? (
          <p className="squads-banner squads-banner-pre" data-testid="squads-prestart">
            Contest has not started. Rank and P&amp;L are placeholders ({SQUADS_PRESTART_BADGE}).
            {contestStart ? (
              <>
                {' '}
                Starts {formatUtc(contestStart)}
                {startLeft ? ` · ${startLeft} left` : ''}.
              </>
            ) : null}{' '}
            Hover a rank or P&amp;L cell for <code>rank_source</code> / <code>pnl_source</code>.
          </p>
        ) : feed?.status === 'live' && contestEnd ? (
          <p className="squads-banner" data-testid="squads-live">
            Contest is live. Ends {formatUtc(contestEnd)}
            {endLeft ? ` · ${endLeft} left` : ''}.
          </p>
        ) : feed?.status === 'ended' && contestEnd ? (
          <p className="squads-banner">Contest ended {formatUtc(contestEnd)}.</p>
        ) : null}
        {stale && feed ? (
          <p className="squads-banner squads-banner-stale">
            Feed is stale. Last update {formatUtc(feed.updated_at)}.
          </p>
        ) : null}
        {loading ? <p className="muted">Loading squads…</p> : null}
        {error ? <p className="form-error">{error}</p> : null}

        {publicNotes.length ? (
          <ul className="squads-notes">
            {publicNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : null}

        <section className="squads-block" aria-labelledby="squads-board">
          <h2 id="squads-board" className="squads-h2">
            Leaderboard
          </h2>
          <div className="squads-scroll">
            <table className="squads-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Squad</th>
                  <th>P&amp;L total</th>
                  <th>Realized / unrealized</th>
                  <th>Liquidatable P&amp;L</th>
                  <th>1h / 6h / 24h</th>
                  <th>Members</th>
                </tr>
              </thead>
              <tbody>
                {squads.map((squad) => (
                  <SquadLeaderRow
                    key={squad.id}
                    squad={squad}
                    open={openId === squad.id}
                    prestart={prestart}
                    methodology={methodology}
                    names={names}
                    onToggle={() => setOpenId(openId === squad.id ? null : squad.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {!loading && !squads.length ? <p className="muted">No squads in the latest feed.</p> : null}
        </section>

        <section className="squads-block" aria-labelledby="squads-anomaly">
          <h2 id="squads-anomaly" className="squads-h2">
            Anomaly score
          </h2>
          <p className="squads-disclaimer" data-testid="squads-disclaimer">
            {disclaimer}{' '}
            <MethodologyLink href={methodology} />
            {' · '}
            <a href={`mailto:${dispute}`}>Corrections: {dispute}</a>
          </p>
          {feed?.anomaly_watch?.caveat ? <p className="muted">{feed.anomaly_watch.caveat}</p> : null}
          <div className="squads-scroll">
            <table className="squads-table">
              <thead>
                <tr>
                  <th>Squad</th>
                  <th>Anomaly score</th>
                  <th>Anomaly rank</th>
                  <th>Flags</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[...squads]
                  .sort((a, b) => (b.anomaly?.anomaly_score || 0) - (a.anomaly?.anomaly_score || 0))
                  .map((squad) => (
                    <tr key={`an-${squad.id}`}>
                      <td>{squad.name}</td>
                      <td>
                        {squad.anomaly?.anomaly_score ?? 0} / 100{' '}
                        <MethodologyLink href={methodology} />
                      </td>
                      <td>{squad.anomaly?.anomaly_rank ?? '—'}</td>
                      <td>{squad.anomaly?.flag_count ?? 0}</td>
                      <td>
                        {(squad.anomaly?.anomaly_flags || []).map((flag, i) => (
                          <EvidenceBlock key={`${flag.type}-${i}`} flag={flag} names={names} />
                        ))}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="squads-block" aria-labelledby="squads-overlap">
          <h2 id="squads-overlap" className="squads-h2">
            Overlap and fresh wallets
          </h2>
          <p className="muted" title={feed?.overlap?.source || undefined}>
            Tokens shared across squads, co-trading, new or shared-funder wallets.
            <SourceTip source={feed?.overlap?.source} />
          </p>
          <h3 className="squads-h3">Shared open tokens</h3>
          {(feed?.overlap?.shared_open_tokens || []).length ? (
            <ul className="squads-list">
              {(feed?.overlap?.shared_open_tokens || []).map((tok) => (
                <li key={tok.mint || tok.symbol}>
                  <TokenLink mint={tok.mint} symbol={tok.symbol} />{' '}
                  {(tok.squads || []).map((id) => resolveSquadLabel(id, names)).join(' · ')}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No shared open tokens in the latest window.</p>
          )}
          <h3 className="squads-h3">Co-trading</h3>
          {(feed?.overlap?.cotrade_pairs || []).length ? (
            <ul className="squads-list">
              {(feed?.overlap?.cotrade_pairs || []).map((pair, i) => (
                <li key={i}>
                  {(pair.squads || []).map((id) => resolveSquadLabel(id, names)).join(' × ')} ·{' '}
                  {pair.same_minute_events ?? 0} same-minute · {pair.mints ?? 0} mints ·{' '}
                  {formatUsd(pair.usd)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No co-trade pairs in the latest window.</p>
          )}
          <h3 className="squads-h3">Fresh wallets</h3>
          {overlapFresh.length ? (
            <ul className="squads-list">
              {overlapFresh.map((row) => (
                <li key={`${row.squad}-${row.wallet}`}>
                  {row.squad} · <WalletLink wallet={row.wallet} /> · {row.age_days ?? '—'}d
                  {row.funder ? (
                    <>
                      {' '}
                      funder <WalletLink wallet={row.funder} />
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">
              <Collecting /> — fresh-wallet traces fill in slowly.
            </p>
          )}
          <h3 className="squads-h3">Shared-funder wallets</h3>
          {overlapFunders.length ? (
            <ul className="squads-list">
              {overlapFunders.map((row) => (
                <li key={row.funder}>
                  Funder <WalletLink wallet={row.funder} /> ·{' '}
                  {row.wallets.map((w) => `${w.squad} ${shortAddr(w.wallet)}`).join(' · ')}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">
              <Collecting /> — shared-funder traces fill in slowly.
            </p>
          )}
        </section>

        <section className="squads-block" aria-labelledby="squads-copy">
          <h2 id="squads-copy" className="squads-h2">
            Copy trade (paper only)
          </h2>
          <p className="muted">
            {paper?.note || 'Simulated copy of squad buys after fees. No real trades.'} Mode{' '}
            {paper?.mode || 'paper'}. Mainnet available {String(paper?.mainnet_available ?? false)}.
          </p>
          <div className="squads-copy-bar">
            <label className="squads-kill">
              <input
                type="checkbox"
                checked={killEngaged}
                disabled={feedKill}
                onChange={(e) => toggleKill(e.target.checked)}
                data-testid="squads-kill"
              />
              Kill switch {feedKill ? '(feed engaged)' : killEngaged ? '(on)' : '(off)'}
            </label>
            <ConnectButton idleLabel="Connect wallet" />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void onDisconnect()}
              disabled={!connected}
              data-testid="squads-disconnect"
            >
              Disconnect
            </button>
          </div>
          {killEngaged ? (
            <p className="squads-banner" data-testid="squads-copy-killed">
              Copy UI disabled. Kill switch is on.
            </p>
          ) : null}
          <fieldset className="squads-copy-ui" disabled={killEngaged}>
            <label className="field-label" htmlFor="squads-picker">
              Squad
            </label>
            <select
              id="squads-picker"
              className="input"
              value={picked}
              onChange={(e) => setPicked(e.target.value)}
              data-testid="squads-picker"
            >
              <option value="">All squads</option>
              {squads.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <p className="squads-live-note" data-testid="squads-live-copy-note">
              {SQUADS_LIVE_COPY_NOTE}
              {copyOff ? ' — paper mode, mainnet is off.' : ''}
            </p>
            <div className="squads-copy-actions">
              <button type="button" className="btn btn-primary btn-sm" disabled title={SQUADS_LIVE_COPY_NOTE}>
                Copy buys
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled title={SQUADS_LIVE_COPY_NOTE}>
                Copy sells
              </button>
            </div>
            <h3 className="squads-h3">Live copy_signals</h3>
            {filteredSignals.length ? (
              <ul className="squads-list squads-signals">
                {filteredSignals.slice(0, 40).map((sig, i) => (
                  <li key={`${sig.time}-${sig.wallet}-${i}`}>
                    {sig.time ? formatWhen(sig.time) : '—'} · {sig.squad || '—'} · {sig.side}{' '}
                    <TokenLink mint={sig.token} symbol={null} /> · {formatUsd(sig.size_usd)} ·{' '}
                    <WalletLink wallet={sig.wallet} /> · {sig.strategy} · {sig.paper_action}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No copy_signals in the latest window.</p>
            )}
            <h3 className="squads-h3">Paper equity curve</h3>
            {Object.keys(strategies).length ? (
              Object.entries(strategies).map(([name, strat]) => (
                <StrategyScore key={name} name={name} strat={strat} />
              ))
            ) : paper?.summary?.strats ? (
              Object.entries(paper.summary.strats).map(([name, strat]) => (
                <StrategyScore key={name} name={name} strat={strat} />
              ))
            ) : (
              <p className="muted">Per-squad paper copy is sparse until more signals land.</p>
            )}
          </fieldset>
        </section>
      </section>
    </div>
  )
}

function SquadLeaderRow({
  squad,
  open,
  prestart,
  methodology,
  names,
  onToggle,
}: {
  squad: SquadRow
  open: boolean
  prestart: boolean
  methodology: string
  names: Map<string, string>
  onToggle: () => void
}) {
  const momentumEmpty = isMomentumCollecting(squad.momentum)
  const ageEmpty = isWalletAgeCollecting(squad.wallet_age)
  const flowsEmpty = isCapitalFlowsCollecting(squad.capital_flows)
  const rvu = squad.realized_vs_unrealized
  return (
    <>
      <tr className={open ? 'is-open' : undefined}>
        <td title={squad.rank_source || undefined}>
          {squad.rank ?? '—'}
          <SourceTip source={squad.rank_source} />
        </td>
        <td>
          <button type="button" className="squads-name" onClick={onToggle} aria-expanded={open}>
            {squad.name}
          </button>
          {squad.struck ? <span className="squads-pill">struck</span> : null}
          {prestart ? <span className="squads-pill">{SQUADS_PRESTART_BADGE}</span> : null}
        </td>
        <td title={squad.pnl_source || undefined}>
          <Money n={squad.pnl_total_usd} signed />
          <SourceTip source={squad.pnl_source} />
        </td>
        <td title={rvu?.source || undefined}>
          {rvu?.realized_usd == null && squad.realized_usd == null ? (
            <Collecting />
          ) : (
            <>
              <Money n={rvu?.realized_usd ?? squad.realized_usd} signed /> /{' '}
              <Money n={rvu?.unrealized_usd ?? squad.unrealized_usd} signed />
            </>
          )}
        </td>
        <td title={squad.liquidity?.source || undefined}>
          <Money n={squad.liquidity?.liquidatable_upnl_usd} signed />
          <SourceTip source={squad.liquidity?.source} />
        </td>
        <td title={squad.momentum?.source || undefined}>
          {momentumEmpty ? (
            <Collecting />
          ) : (
            <>
              {isMomentumWindowEmpty(squad.momentum?.['1h'])
                ? '—'
                : formatUsdSigned(squad.momentum?.['1h']?.pnl_change_usd)}
              {' / '}
              {isMomentumWindowEmpty(squad.momentum?.['6h'])
                ? '—'
                : formatUsdSigned(squad.momentum?.['6h']?.pnl_change_usd)}
              {' / '}
              {isMomentumWindowEmpty(squad.momentum?.['24h'])
                ? '—'
                : formatUsdSigned(squad.momentum?.['24h']?.pnl_change_usd)}
            </>
          )}
        </td>
        <td>
          {squad.member_count ?? squad.members_known ?? squad.members?.length ?? '—'}
        </td>
      </tr>
      {open ? (
        <tr className="squads-expand">
          <td colSpan={7}>
            <div className="squads-expand-grid">
              <div>
                <h3 className="squads-h3">
                  Open positions <SourceTip source={squad.open_positions_source || squad.positions_source} />
                </h3>
                <PositionsTable rows={squad.open_positions || []} kind="open" />
              </div>
              <div>
                <h3 className="squads-h3">
                  Closed positions <SourceTip source={squad.positions_source} />
                </h3>
                <PositionsTable rows={squad.closed_positions || []} kind="closed" />
              </div>
              <div>
                <h3 className="squads-h3">
                  Member P&amp;L and carry share <SourceTip source={squad.carry_concentration?.source} />
                </h3>
                <ul className="squads-list">
                  {(squad.members || []).map((m) => (
                    <li key={m.wallet || m.username || m.x_handle}>
                      <MemberPublic member={m} /> · <Money n={m.pnl_usd} signed />
                      {m.pnl_source ? <span className="muted"> · {m.pnl_source}</span> : null}
                    </li>
                  ))}
                </ul>
                {squad.carry_concentration?.top1_username || squad.carry_concentration?.top1_wallet ? (
                  <p className="muted">
                    Top carry {publicMemberLabel({
                      username: squad.carry_concentration.top1_username,
                      wallet: squad.carry_concentration.top1_wallet,
                    })}{' '}
                    {formatPct(squad.carry_concentration.top1_share_of_positive_pnl)} of positive P&amp;L
                  </p>
                ) : null}
              </div>
              <div>
                <h3 className="squads-h3">
                  Trade stats <SourceTip source={squad.trade_stats?.source} />
                </h3>
                <p>
                  Win rate {formatPct(squad.trade_stats?.win_rate)} · hold avg{' '}
                  {formatHoldMin(squad.trade_stats?.avg_hold_min)} / median{' '}
                  {formatHoldMin(squad.trade_stats?.median_hold_min)}
                </p>
                <p>
                  Best{' '}
                  <TokenLink
                    mint={squad.trade_stats?.best_trade?.mint}
                    symbol={squad.trade_stats?.best_trade?.symbol}
                  />{' '}
                  <Money n={squad.trade_stats?.best_trade?.realized_usd} signed />
                </p>
                <p>
                  Worst{' '}
                  <TokenLink
                    mint={squad.trade_stats?.worst_trade?.mint}
                    symbol={squad.trade_stats?.worst_trade?.symbol}
                  />{' '}
                  <Money n={squad.trade_stats?.worst_trade?.realized_usd} signed />
                </p>
              </div>
              <div>
                <h3 className="squads-h3">
                  Exit risk <SourceTip source={squad.exit_risk?.source} />
                </h3>
                <p>
                  Max supply held {squad.exit_risk?.max_supply_share_pct != null
                    ? `${squad.exit_risk.max_supply_share_pct.toFixed(2)}%`
                    : '—'}{' '}
                  · over 5% {squad.exit_risk?.positions_over_5pct_supply ?? 0}
                </p>
                <h3 className="squads-h3">
                  Early-entry edge <SourceTip source={squad.early_entry_edge?.source} />
                </h3>
                <p>
                  Tokens {squad.early_entry_edge?.tokens_entered ?? '—'} · 5x hit{' '}
                  {formatPct(squad.early_entry_edge?.hit_rate_5x)} · median peak{' '}
                  {squad.early_entry_edge?.median_peak_multiple ?? '—'}×
                </p>
              </div>
              <div>
                <h3 className="squads-h3">
                  Capital flows <SourceTip source={squad.capital_flows?.source} />
                </h3>
                {flowsEmpty ? (
                  <Collecting />
                ) : (
                  <p>
                    Sampled {squad.capital_flows?.wallets_sampled}/{squad.capital_flows?.wallets_total} · in{' '}
                    {squad.capital_flows?.sol_in} SOL · out {squad.capital_flows?.sol_out} SOL · CEX{' '}
                    {squad.capital_flows?.sol_to_cex} SOL
                  </p>
                )}
                <h3 className="squads-h3">
                  Wallet age <SourceTip source={squad.wallet_age?.source} />
                </h3>
                {ageEmpty ? (
                  <Collecting />
                ) : (
                  <p>
                    Traced {squad.wallet_age?.traced} · fresh &lt;14d {squad.wallet_age?.fresh_lt_14d?.length ?? 0}
                  </p>
                )}
                <h3 className="squads-h3">
                  Anomaly score <MethodologyLink href={methodology} />
                </h3>
                <p>
                  {squad.anomaly?.anomaly_score ?? 0} / 100
                  {squad.anomaly?.anomaly_rank != null ? ` · rank ${squad.anomaly.anomaly_rank}` : ''}
                </p>
                {(squad.anomaly?.anomaly_flags || []).map((flag, i) => (
                  <EvidenceBlock key={`${flag.type}-${i}`} flag={flag} names={names} />
                ))}
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  )
}
