import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CREW_AGENT_API_URL } from '../lib/config'
import { coinPagePath } from '../lib/routes'
import {
  COINS_PAGE_SIZE,
  applyLiveCoinsBoard,
  availableCoinVenues,
  formatPctChange,
  formatUsdCompact,
  paginateRows,
  sortLiveCoins,
  type LiveCoinFilter,
  type LiveCoinRow,
  type LiveCoinSort,
} from '../lib/live-coins'
import { platformShortName } from '../lib/platforms'
import { CoinLogo } from './CoinLogo'

type Props = {
  limit?: number
  heading?: string
  allLink?: boolean
  compact?: boolean
  layout?: 'list' | 'cards'
  pageSize?: number
}

const SORT_OPTIONS: { id: LiveCoinSort; label: string }[] = [
  { id: 'mcap', label: 'Market cap' },
  { id: 'change24h', label: '% change 24h' },
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
]

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
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<LiveCoinSort>('mcap')
  const [filter, setFilter] = useState<LiveCoinFilter>('all')
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

  const board = useMemo(() => {
    if (!coins) return null
    if (cards) return applyLiveCoinsBoard(coins, { query, sort, filter })
    return sortLiveCoins(coins)
  }, [coins, cards, query, sort, filter])

  const paging = useMemo(() => {
    if (!board || !size) return null
    return paginateRows(board, page, size)
  }, [board, page, size])
  const visible = paging ? paging.slice : board
  const showPager = Boolean(board && size && board.length > size && paging)
  const venues = useMemo(() => (coins ? availableCoinVenues(coins) : []), [coins])
  const chips: { id: LiveCoinFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'bonding', label: 'Bonding curve' },
    { id: 'graduated', label: 'Graduated' },
    ...venues.map((id) => ({ id, label: platformShortName(id) })),
  ]

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
      {cards && coins && coins.length > 0 ? (
        <div className="coins-board-tools">
          <div className="coins-board-controls">
            <input
              className="coins-board-search"
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(1)
              }}
              placeholder="Search name, ticker, or mint"
              aria-label="Search name, ticker, or mint"
              autoComplete="off"
              spellCheck={false}
            />
            <select
              className="coins-board-sort"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as LiveCoinSort)
                setPage(1)
              }}
              aria-label="Sort coins"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="plat-filter coins-board-filters" role="tablist" aria-label="Filter coins">
            {chips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                role="tab"
                aria-selected={filter === chip.id}
                className={`plat-filter-btn${filter === chip.id ? ' is-on' : ''}`}
                onClick={() => {
                  setFilter(chip.id)
                  setPage(1)
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>
          {board ? (
            <p className="coins-board-count">
              {board.length === coins.length
                ? `${board.length} coin${board.length === 1 ? '' : 's'}`
                : `${board.length} of ${coins.length}`}
            </p>
          ) : null}
        </div>
      ) : null}
      {coins == null ? <p className="section-sub">Loading…</p> : null}
      {error ? <p className="section-sub live-coins-empty">{error}</p> : null}
      {coins && coins.length === 0 && !error ? (
        <p className="section-sub live-coins-empty">No CrewPay launches yet.</p>
      ) : null}
      {coins && coins.length > 0 && board && board.length === 0 ? (
        <p className="section-sub live-coins-empty">No coins match that search or filter.</p>
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
