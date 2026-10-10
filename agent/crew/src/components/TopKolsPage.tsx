import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CREW_VERSION } from '../lib/config'
import { topKolRecords, type KolRecord } from '../lib/pump/kol-directory'
import { kolProfilePath } from '../lib/routes'

const API = (
  (import.meta.env.VITE_CREW_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'https://api.crewpay.dev'
)

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

function xUrl(kol: KolRecord) {
  const handle = (kol.x || kol.pump || '').replace(/^@+/, '')
  return handle ? `https://x.com/${handle}` : null
}

export function TopKolsPage() {
  const top = topKolRecords(20)
  const [registered, setRegistered] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`${API}/api/kols/registered?limit=100`)
        if (!res.ok) return
        const data = (await res.json()) as {
          leaderboard?: { xUsername?: string }[]
        }
        if (cancelled) return
        setRegistered(
          new Set(
            (data.leaderboard || []).map((r) =>
              String(r.xUsername || '')
                .replace(/^@+/, '')
                .toLowerCase(),
            ),
          ),
        )
      } catch {
        /* directory still works without badges */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="app-shell page-kols">
      <section className="section section-kols" id="kols">
        <div className="kols-page-head">
          <div className="launch-page-head-row">
            <Link className="launch-back" to="/">
              ← Home
            </Link>
            <p className="section-label">Directory · v{CREW_VERSION}</p>
          </div>
          <h1 className="section-title">Autohire directory.</h1>
          <p className="section-sub">
            Public Pump reach list for Autohire. Registered crew get a verified badge and hire
            priority when they match the narrative.
          </p>
          <div className="register-actions">
            <Link className="btn btn-primary btn-sm" to="/register">
              Join as crew
            </Link>
            <Link className="btn btn-ghost btn-sm" to="/launch">
              Launch with Autohire
            </Link>
          </div>
        </div>

        <div className="kols-table" role="table" aria-label="Top 20 KOLs">
          <div className="kols-row kols-row-head" role="row">
            <span role="columnheader">#</span>
            <span role="columnheader">KOL</span>
            <span role="columnheader">Followers</span>
            <span role="columnheader">Narratives</span>
            <span role="columnheader">Wallet</span>
          </div>
          {top.map((kol) => {
            const bare = (kol.x || kol.pump).replace(/^@+/, '')
            const handle = `@${bare}`
            const link = xUrl(kol)
            const isRegistered = registered.has(bare.toLowerCase())
            return (
              <div className="kols-row" role="row" key={kol.id}>
                <span className="kols-rank" role="cell">
                  {kol.rank}
                </span>
                <span className="kols-identity" role="cell">
                  {isRegistered ? (
                    <Link to={kolProfilePath(bare)}>
                      {handle}
                      <span className="kol-verified" title="Registered crew">
                        {' '}
                        ✓ verified
                      </span>
                    </Link>
                  ) : link ? (
                    <a href={link} target="_blank" rel="noreferrer">
                      {handle}
                    </a>
                  ) : (
                    <strong>{handle}</strong>
                  )}
                  <span className="kols-pump">pump/{kol.pump}</span>
                </span>
                <span className="kols-foll" role="cell">
                  {formatFollowers(kol.followers)}
                </span>
                <span className="kols-tags" role="cell">
                  {kol.narratives.slice(0, 3).map((t) => (
                    <em key={t}>{t}</em>
                  ))}
                </span>
                <span className="kols-wallet" role="cell" title={kol.wallet}>
                  {shortAddr(kol.wallet)}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      <footer className="footer">
        <div>CREW · Top KOLs · v{CREW_VERSION}</div>
        <div>
          <Link to="/">Home</Link>
          {" · "}
          <Link to="/agents">Agent API</Link>
          {" · "}
          <Link to="/launch">Launch desk</Link>
        </div>
      </footer>
    </div>
  )
}
