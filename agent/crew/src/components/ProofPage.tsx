import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  CREW_PUBLIC_API_URL,
  CREW_VERSION,
  CREW_TOKEN_MINT,
  CREW_TOKEN_PUMP_URL,
  SOLSCAN_TX_URL,
  readLegacyPlatformBuybackWallets,
} from '../lib/config'
import { fetchProof, type ProofBundle } from '../lib/api'
import { formatSol } from '../lib/format-sol'
import { PlatformBadge } from './PlatformBadge'
import { PlatformFilter } from './PlatformFilter'
import { useLaunchVenues } from '../lib/use-launch-venues'
import {
  explorerTxUrl,
  inferLaunchPlatform,
  tradeLabel,
  type LaunchPlatform,
} from '../lib/platforms'

function shortAddr(addr: string) {
  if (!addr || addr.length < 10) return addr || '—'
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`
}

function fmtSol(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—'
  return `${formatSol(n)} SOL`
}

function fmtTime(ms: number) {
  try {
    return new Date(ms).toLocaleString()
  } catch {
    return '—'
  }
}

function remitExplorerUrl(
  signature: string,
  mint: string,
  coins: ProofBundle['coins'],
): string {
  const coin = coins.find((c) => c.mint === mint)
  return (
    explorerTxUrl(
      inferLaunchPlatform({ platform: coin?.platform, pumpUrl: coin?.pumpUrl, mint }),
      signature,
    ) || SOLSCAN_TX_URL(signature)
  )
}

export function ProofPage() {
  const [data, setData] = useState<ProofBundle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [platFilter, setPlatFilter] = useState<LaunchPlatform | 'all'>('all')
  const venues = useLaunchVenues()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const bundle = await fetchProof(40)
        if (!cancelled) {
          setData(bundle)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load proof tape')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="app-shell page-proof">
      <section className="section section-proof" id="proof">
        <div className="proof-page-head">
          <div className="launch-page-head-row">
            <Link className="launch-back" to="/">
              ← Home
            </Link>
            <p className="section-label">Proof · v{CREW_VERSION}</p>
          </div>
          <motion.h1
            className="section-title"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
          >
            Buyback & crew pay.
          </motion.h1>
          <p className="section-sub">
            Public proof that agents hired, fees locked, and crew got paid. 25% CrewPay treasury
            fee-share locks on every launch; market buyback cron is not live yet.
          </p>
          <div className="proof-head-actions">
            <Link className="btn btn-primary btn-sm" to="/launch">
              Open launch desk
            </Link>
            <Link className="btn btn-ghost btn-sm" to="/agents">
              Agents API
            </Link>
            {CREW_TOKEN_MINT ? (
              <a className="btn btn-ghost btn-sm" href={CREW_TOKEN_PUMP_URL} target="_blank" rel="noreferrer">
                $CREW on Pump
              </a>
            ) : null}
          </div>
        </div>

        {loading ? <p className="section-sub">Loading proof…</p> : null}
        {error ? (
          <p className="desk-msg desk-msg-error" role="alert">
            {error}
          </p>
        ) : null}

        {data ? (
          <>
            <div className="proof-stats" aria-label="Proof stats">
              <div>
                <strong>{data.stats.buybackOkRuns}</strong>
                <span>buybacks ok</span>
              </div>
              <div>
                <strong>{fmtSol(data.stats.buybackSolSpent)}</strong>
                <span>SOL → CREW</span>
              </div>
              <div>
                <strong>{fmtSol((data.stats as any).humansPaidSol ?? data.stats.remitSolTotal)}</strong>
                <span>crew remits</span>
              </div>
              <div>
                <strong>{data.stats.feeShareLocked}</strong>
                <span>fees locked</span>
              </div>
              <div>
                <strong>{data.platform.kolDirectorySize}</strong>
                <span>KOL directory</span>
              </div>
            </div>

            <div className="proof-meta">
              <span>
                Buyback wallet{' '}
                <code title={data.platform.buybackWallet || ''}>
                  {shortAddr(data.platform.buybackWallet || '')}
                </code>
              </span>
              {readLegacyPlatformBuybackWallets().length ? (
                <span>
                  Legacy treasury{' '}
                  <code title={readLegacyPlatformBuybackWallets().join(', ')}>
                    {shortAddr(readLegacyPlatformBuybackWallets()[0]!)}
                  </code>
                </span>
              ) : null}
              <span>
                CREW mint{' '}
                <code title={data.platform.crewMint || ''}>
                  {data.platform.crewMint ? shortAddr(data.platform.crewMint) : 'TBA'}
                </code>
              </span>
              <span>
                API <a href={`${CREW_PUBLIC_API_URL}/api/proof`}>{CREW_PUBLIC_API_URL}/api/proof</a>
              </span>
            </div>

            <h2 className="proof-section-title">Buyback runs</h2>
            <div className="proof-table" role="table" aria-label="Buyback runs">
              <div className="proof-row proof-row-head" role="row">
                <span role="columnheader">When</span>
                <span role="columnheader">Status</span>
                <span role="columnheader">SOL</span>
                <span role="columnheader">Detail</span>
                <span role="columnheader">Tx</span>
              </div>
              {data.buybacks.length === 0 ? (
                <p className="section-sub">No buyback runs yet — cron skips until mint + key are set.</p>
              ) : (
                data.buybacks.map((r) => (
                  <div className="proof-row" role="row" key={r.id}>
                    <span role="cell">{fmtTime(r.at)}</span>
                    <span role="cell">
                      <em className={`proof-status proof-status-${r.status}`}>{r.status}</em>
                    </span>
                    <span role="cell">{r.solSpent == null ? '—' : fmtSol(r.solSpent)}</span>
                    <span role="cell" className="proof-detail">
                      {r.detail || '—'}
                    </span>
                    <span role="cell">
                      {r.signature ? (
                        <a href={SOLSCAN_TX_URL(r.signature)} target="_blank" rel="noreferrer">
                          {shortAddr(r.signature)}
                        </a>
                      ) : (
                        '—'
                      )}
                    </span>
                  </div>
                ))
              )}
            </div>

            <h2 className="proof-section-title">Recent remits</h2>
            <div className="proof-table" role="table" aria-label="Remits">
              <div className="proof-row proof-row-head" role="row">
                <span role="columnheader">When</span>
                <span role="columnheader">Ticker</span>
                <span role="columnheader">Handle</span>
                <span role="columnheader">Amount</span>
                <span role="columnheader">Tx</span>
              </div>
              {data.remits.length === 0 ? (
                <p className="section-sub">No remits yet — crank from the desk or via crew_crank_remits.</p>
              ) : (
                data.remits.slice(0, 20).map((r) => (
                  <div className="proof-row" role="row" key={r.id}>
                    <span role="cell">{fmtTime(r.at)}</span>
                    <span role="cell">${r.ticker}</span>
                    <span role="cell">{r.handle}</span>
                    <span role="cell">{fmtSol(r.amountSol)}</span>
                    <span role="cell">
                      {r.signature ? (
                        <a href={remitExplorerUrl(r.signature, r.mint, data.coins)} target="_blank" rel="noreferrer">
                          {shortAddr(r.signature)}
                        </a>
                      ) : (
                        '—'
                      )}
                    </span>
                  </div>
                ))
              )}
            </div>

            <h2 className="proof-section-title">Content job receipts</h2>
            <div className="proof-table" role="table" aria-label="Content job receipts">
              <div className="proof-row proof-row-head" role="row">
                <span role="columnheader">When</span>
                <span role="columnheader">Kind</span>
                <span role="columnheader">Job</span>
                <span role="columnheader">Amount</span>
                <span role="columnheader">Proof</span>
              </div>
              {!(data.jobReceipts && data.jobReceipts.length) ? (
                <p className="section-sub">
                  No content-job receipts yet — agent-picked winners and refunds show here (devnet).
                </p>
              ) : (
                data.jobReceipts.map((r) => (
                  <div className="proof-row" role="row" key={r.id}>
                    <span role="cell">{fmtTime(r.at)}</span>
                    <span role="cell">{r.kind}</span>
                    <span role="cell">
                      <Link to={r.jobUrl || `/jobs/${r.jobId}`}>{r.title || r.jobId}</Link>
                    </span>
                    <span role="cell">
                      {r.amount} {r.asset}
                    </span>
                    <span role="cell">
                      {r.xUrl ? (
                        <a href={r.xUrl} target="_blank" rel="noreferrer">
                          X
                        </a>
                      ) : (
                        r.status
                      )}
                    </span>
                  </div>
                ))
              )}
            </div>

            <h2 className="proof-section-title">Launches</h2>
            <PlatformFilter venues={venues} value={platFilter} onChange={setPlatFilter} />
            <div className="proof-table" role="table" aria-label="Launches">
              <div className="proof-row proof-row-head" role="row">
                <span role="columnheader">Ticker</span>
                <span role="columnheader">Venue</span>
                <span role="columnheader">Fees</span>
                <span role="columnheader">Mint</span>
                <span role="columnheader">Trade</span>
              </div>
              {data.coins
                .filter((c) => {
                  if (platFilter === 'all') return true
                  return inferLaunchPlatform({ platform: c.platform, pumpUrl: c.pumpUrl, mint: c.mint }) === platFilter
                })
                .map((c) => (
                <div className="proof-row" role="row" key={c.mint}>
                  <span role="cell">${c.ticker}</span>
                  <span role="cell">
                    <PlatformBadge platform={c.platform} pumpUrl={c.pumpUrl} mint={c.mint} />
                  </span>
                  <span role="cell">
                    {c.feeShareLocked ? 'locked' : 'fees NOT locked'}
                  </span>
                  <span role="cell">{shortAddr(c.mint)}</span>
                  <span role="cell">
                    <a href={c.pumpUrl} target="_blank" rel="noreferrer">
                      {tradeLabel(
                        inferLaunchPlatform({ platform: c.platform, pumpUrl: c.pumpUrl, mint: c.mint }),
                      )}
                    </a>
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </section>
    </div>
  )
}
