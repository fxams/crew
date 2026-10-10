import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  CREW_PUBLIC_API_URL,
  CREW_VERSION,
  CREW_TOKEN_MINT,
  CREW_TOKEN_PUMP_URL,
  SOLSCAN_TX_URL,
} from '../lib/config'
import { fetchProof, type ProofBundle } from '../lib/api'

function shortAddr(addr: string) {
  if (!addr || addr.length < 10) return addr || '—'
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`
}

function fmtSol(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—'
  return `${n.toFixed(4)} SOL`
}

function fmtTime(ms: number) {
  try {
    return new Date(ms).toLocaleString()
  } catch {
    return '—'
  }
}

export function ProofPage() {
  const [data, setData] = useState<ProofBundle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

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
                <strong>{fmtSol(data.stats.remitSolTotal)}</strong>
                <span>remit tape</span>
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

            <h2 className="proof-section-title">Launches</h2>
            <div className="proof-table" role="table" aria-label="Launches">
              <div className="proof-row proof-row-head" role="row">
                <span role="columnheader">Ticker</span>
                <span role="columnheader">Mode</span>
                <span role="columnheader">Fees</span>
                <span role="columnheader">Mint</span>
                <span role="columnheader">Pump</span>
              </div>
              {data.coins.map((c) => (
                <div className="proof-row" role="row" key={c.mint}>
                  <span role="cell">${c.ticker}</span>
                  <span role="cell">{c.mode}</span>
                  <span role="cell">{c.feeShareLocked ? 'locked' : 'open'}</span>
                  <span role="cell">{shortAddr(c.mint)}</span>
                  <span role="cell">
                    <a href={c.pumpUrl} target="_blank" rel="noreferrer">
                      open
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
