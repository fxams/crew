import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CREW_AGENT_API_URL } from '../lib/config'
import { coinPagePath } from '../lib/routes'
import {
  formatPctChange,
  formatUsdCompact,
  type LiveCoinRow,
} from '../lib/live-coins'

type Props = {
  limit?: number
  heading?: string
  allLink?: boolean
}

export function LiveCoins({ limit = 8, heading = 'Live coins', allLink = true }: Props) {
  const [coins, setCoins] = useState<LiveCoinRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <section className="live-coins" aria-labelledby="live-coins-title">
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
      {coins && coins.length > 0 ? (
        <ul className="live-coins-list">
          {coins.map((c) => {
            const chg = formatPctChange(c.priceChange24h)
            const up = (c.priceChange24h || 0) > 0
            const down = (c.priceChange24h || 0) < 0
            const initial = (c.ticker || '?').slice(0, 1).toUpperCase()
            return (
              <li key={c.mint}>
                <Link className="live-coins-row" to={coinPagePath(c.mint)}>
                  {c.imageUrl ? (
                    <img className="live-coins-logo" src={c.imageUrl} alt="" width={40} height={40} />
                  ) : (
                    <span className="live-coins-logo live-coins-logo-fallback" aria-hidden>
                      {initial}
                    </span>
                  )}
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
    </section>
  )
}
