import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { KOL_PROGRAM_ENABLED } from '../lib/config'
import { formatUtc } from '../lib/format-utc'
import { KOL_PROGRAM_POINTS_DISCLAIMER, fetchKolFounders } from '../lib/kol-program'
import { kolProfilePath } from '../lib/routes'
import { KolMobileTabBar } from './KolMobileTabBar'

export function KolFoundersPage() {
  const [founders, setFounders] = useState<
    Array<{ badgeNumber: number; handle: string; seasonPoints: number; reachScore: number }>
  >([])
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null)

  useEffect(() => {
    if (!KOL_PROGRAM_ENABLED) return
    void fetchKolFounders().then((data) => {
      if (!data) return
      setFounders(data.founders)
      setSnapshotAt(data.snapshotAt)
    })
  }, [])

  if (!KOL_PROGRAM_ENABLED) {
    return (
      <div className="app-shell page-kols">
        <p className="section-sub">KOL program is not enabled.</p>
      </div>
    )
  }

  return (
    <div className="app-shell page-kol-founders">
      <section className="section">
        <p className="section-label">Founding KOLs</p>
        <h1 className="section-title">Permanent founding list</h1>
        <p className="section-sub">
          Off-chain badges only — no mint. Top season scorers at the founding snapshot freeze as
          Founding KOL #NNN.
        </p>
        {snapshotAt ? (
          <p className="hint">Snapshot: {formatUtc(snapshotAt)}</p>
        ) : (
          <p className="hint">Snapshot has not run yet — see countdown on /kol.</p>
        )}
        <Link className="btn btn-ghost btn-sm" to="/kol">← KOL hub</Link>
        <ul className="kol-founders-list">
          {founders.map((f) => (
            <li key={f.badgeNumber}>
              <span className="kol-founder-badge">#{String(f.badgeNumber).padStart(3, '0')}</span>
              <Link to={kolProfilePath(f.handle)}>@{f.handle}</Link>
              <span className="hint">{f.seasonPoints} pts · reach {f.reachScore}</span>
            </li>
          ))}
        </ul>
        <p className="section-sub">{KOL_PROGRAM_POINTS_DISCLAIMER}</p>
      </section>
      <KolMobileTabBar />
    </div>
  )
}
