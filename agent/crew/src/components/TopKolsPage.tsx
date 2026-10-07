import { Link } from 'react-router-dom'
import { CREW_VERSION } from '../lib/config'
import { topKolRecords, type KolRecord } from '../lib/pump/kol-directory'

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
          <h1 className="section-title">Top 20 KOLs.</h1>
          <p className="section-sub">
            Highest-reach wallets in the CREW 1500 list — ranked by followers. Hire them from
            the launch desk with narrative matching.
          </p>
          <Link className="btn btn-primary btn-sm" to="/launch">
            Open launch desk
          </Link>
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
            const handle = `@${(kol.x || kol.pump).replace(/^@+/, '')}`
            const link = xUrl(kol)
            return (
              <div className="kols-row" role="row" key={kol.id}>
                <span className="kols-rank" role="cell">
                  {kol.rank}
                </span>
                <span className="kols-identity" role="cell">
                  {link ? (
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
    </div>
  )
}
