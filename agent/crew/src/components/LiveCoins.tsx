import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CREW_AGENT_API_URL } from '../lib/config'
import { coinPagePath } from '../lib/routes'
import {
  COINS_PAGE_SIZE,
  formatPctChange,
  formatUsdCompact,
  paginateRows,
  type LiveCoinRow,
} from '../lib/live-coins'
import { CoinLogo } from './CoinLogo'

type Props = {
  limit?: number
  heading?: string
  allLink?: boolean
  compact?: boolean
  layout?: 'list' | 'cards'
  pageSize?: number
}

export function LiveCoins({
  limit = 5,
  heading = 'Live coins',
  allLink = true,
  compact = false,
  layout = 'list',
  pageSize,
}: Props) {
  const [coins, setCoins] = useState<LiveCoinRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const cards = layout === 'cards'
  const size = pageSize ?? (cards ? COINS_PAGE_SIZE : 0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${CREW_AGENT_API_URL}/api/coins/live?limit=${limit}`)
        if (!res.ok) throw new Error('Could not load coins')
        const data = (await res.json()) as { coins?: LiveCoinRow[] }
        if (!cancelled) {
          setCoins(Array.isArray(data.coins) ? data.coins : [])
          setError(null)
          setPage(1)
        }
      } catch (err) {
        if (!cancelled) {
          setCoins([])
          setError(err instanceof Error ? err.message : 'Could not load coins')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [limit])

  const paging = useMemo(() => {
    if (!coins || !size) return null
    return paginateRows(coins, page, size)
  }, [coins, page, size])
  const visible = paging ? paging.slice : coins
  const showPager = Boolean(coins && size && coins.length > size && paging)

  return (
    <section
      className={`live-coins${compact ? ' is-compact' : ''}${cards ? ' is-cards' : ''}`}
      aria-labelledby="live-coins-title"
    >
      <div className="live-coins-head">
        <h2 className="section-title" id="live-coins-title">
          {heading}
        </h2>
        {allLink ? (
          <Link className="live-coins-all" to="/coins">
            All coins
          </Link>
        ) : null}
      </div>
      {coins == null ? <p className="section-sub">Loading…</p> : null}
      {error ? <p className="section-sub live-coins-empty">{error}</p> : null}
      {coins && coins.length === 0 && !error ? (
        <p className="section-sub live-coins-empty">No CrewPay launches yet.</p>
      ) : null}
      {visible && visible.length > 0 ? (
        <ul className="live-coins-list">
          {visible.map((c) => {
            const chg = formatPctChange(c.priceChange24h)
            const up = (c.priceChange24h || 0) > 0
            const down = (c.priceChange24h || 0) < 0
            return (
              <li key={c.mint}>
                <Link
                  className={cards ? 'live-coins-card' : 'live-coins-row'}
                  to={coinPagePath(c.mint)}
                >
                  <CoinLogo mint={c.mint} ticker={c.ticker} size={cards ? 48 : compact ? 28 : 40} />
                  <span className="live-coins-id">
                    <strong>${c.ticker}</strong>
                    <em>{c.name}</em>
                  </span>
                  <span className="live-coins-quote">
                    <strong>{formatUsdCompact(c.marketCapUsd)}</strong>
                    <em className={up ? 'is-up' : down ? 'is-down' : undefined}>{chg}</em>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      ) : null}
      {showPager && paging ? (
        <nav className="coins-pager" aria-label="Coin pages">
          {Array.from({ length: paging.pages }, (_, i) => {
            const n = i + 1
            return (
              <button
                key={n}
                type="button"
                className={paging.page === n ? 'is-on' : undefined}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            )
          })}
        </nav>
      ) : null}
    </section>
  )
}
