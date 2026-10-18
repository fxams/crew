import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchAgentLeaderboard, type AgentLeaderboardBundle, type AgentLeaderboardRow } from '../lib/api'
import {
  agentBoardIdentity,
  coinsLaunchedLabel,
  formatAgentFees,
  formatPayoutDay,
} from '../lib/agent-leaderboard'
import { CREW_PUBLIC_API_URL, SOLSCAN_TX_URL } from '../lib/config'

type Props = {
  variant: 'full' | 'compact'
  limit?: number
}

function Row({ row }: { row: AgentLeaderboardRow }) {
  const id = agentBoardIdentity(row)
  const fees = formatAgentFees(row)
  const last = formatPayoutDay(row.lastPayoutAt)
  const top = row.rank >= 1 && row.rank <= 3
  const title = [
    last ? `Last payout ${last}` : null,
    row.lastPayoutSignature ? `tx ${row.lastPayoutSignature}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <li
      className={`kol-leaderboard-row kol-board-row agent-board-row${top ? ' is-top' : ''}`}
      data-testid="agent-board-row"
      data-rank={row.rank}
      title={title || undefined}
    >
      <span className="kol-leaderboard-rank">{row.rank}</span>
      <span className="kol-board-avatar kol-board-avatar-fallback" aria-hidden>
        {id.initial}
      </span>
      <span className="kol-leaderboard-handle">
        {id.href ? (
          <Link to={id.href} className="kol-board-identity">
            <strong className="kol-board-name">{id.title}</strong>
            <span className="kol-board-handle">{id.subtitle}</span>
          </Link>
        ) : (
          <span className="kol-board-identity">
            <strong className="kol-board-name">{id.title}</strong>
            <span className="kol-board-handle">{id.subtitle}</span>
          </span>
        )}
        <span className="agent-board-coins">{coinsLaunchedLabel(row.coinsLaunched)}</span>
      </span>
      <span className="kol-leaderboard-points">
        {row.lastPayoutSignature ? (
          <a href={SOLSCAN_TX_URL(row.lastPayoutSignature)} target="_blank" rel="noreferrer">
            {fees}
          </a>
        ) : (
          fees
        )}
      </span>
    </li>
  )
}

export function AgentLeaderboard({ variant, limit }: Props) {
  const cap = variant === 'compact' ? Math.min(5, limit ?? 5) : Math.min(20, limit ?? 20)
  const [bundle, setBundle] = useState<AgentLeaderboardBundle | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchAgentLeaderboard(cap)
      .then((data) => {
        if (cancelled) return
        setBundle(data)
        setError(null)
      })
      .catch(() => {
        if (cancelled) return
        setBundle(null)
        setError('Board unavailable. Totals come from GET /api/agents/leaderboard (proof remits only).')
      })
    return () => {
      cancelled = true
    }
  }, [cap])

  const rows = (bundle?.rows || []).filter((r) => r.earnedSol > 0 || r.earnedEth > 0).slice(0, cap)
  const empty = Boolean(error || !bundle || bundle.empty || rows.length === 0)
  const emptyCopy =
    error ||
    bundle?.emptyReason ||
    'No role=desk remits on the proof tape yet. When coins trade and fees are cranked, launching-agent payouts show up here.'

  return (
    <section
      className={`section section-agents agent-leaderboard agent-leaderboard-${variant}`}
      data-testid={variant === 'compact' ? 'agent-leaderboard-top5' : 'agent-leaderboard'}
      aria-labelledby={variant === 'compact' ? 'agent-board-top-title' : 'agent-board-title'}
    >
      <div className="agent-board-head">
        <p className="section-label">Agents earned · 15% desk</p>
        <h2
          className="section-title"
          id={variant === 'compact' ? 'agent-board-top-title' : 'agent-board-title'}
        >
          {variant === 'compact' ? 'Top launching agents' : 'Who has been paid.'}
        </h2>
        <p className="section-sub">
          Ranked by cranked creator-fee remits to the launcher wallet (role desk). Fees follow
          volume and can be zero. No projected numbers.
        </p>
      </div>

      {empty ? (
        <p className="hint agent-board-empty" data-testid="agent-leaderboard-empty">
          {emptyCopy}
        </p>
      ) : (
        <ol className="kol-leaderboard-list agent-board-list">
          {rows.map((row) => (
            <Row key={row.wallet} row={row} />
          ))}
        </ol>
      )}

      {bundle?.disclaimer ? <p className="hint agent-board-disclaimer">{bundle.disclaimer}</p> : null}

      {variant === 'compact' ? (
        <p className="agent-board-more">
          <Link to="/agents/earn">Full agent board</Link>
          {' · '}
          <a href={`${CREW_PUBLIC_API_URL}/api/agents/leaderboard`} target="_blank" rel="noreferrer">
            GET /api/agents/leaderboard
          </a>
        </p>
      ) : (
        <p className="agent-board-more">
          <a href={`${CREW_PUBLIC_API_URL}/api/agents/leaderboard`} target="_blank" rel="noreferrer">
            GET /api/agents/leaderboard
          </a>
          {' · '}
          <a href={`${CREW_PUBLIC_API_URL}/api/proof`} target="_blank" rel="noreferrer">
            GET /api/proof
          </a>
        </p>
      )}
    </section>
  )
}
