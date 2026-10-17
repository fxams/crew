import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CREW_VERSION, KOL_PROGRAM_ENABLED } from '../lib/config'
import {
  fetchKolProgramLeaderboard,
  fetchKolProgramSeasons,
  type KolLeaderboardRow,
  type KolProgramSeason,
} from '../lib/kol-program'
import { kolProfilePath } from '../lib/routes'

function founderLabel(n: number | null): string | null {
  if (n == null || n < 1) return null
  return `#${String(n).padStart(3, '0')}`
}

export function KolLeaderboardPage() {
  const [rows, setRows] = useState<KolLeaderboardRow[]>([])
  const [seasonId, setSeasonId] = useState<string>('')
  const [disclaimer, setDisclaimer] = useState('')
  const [seasons, setSeasons] = useState<KolProgramSeason[]>([])
  const [archiveSeason, setArchiveSeason] = useState<string | null>(null)
  const [archiveRows, setArchiveRows] = useState<KolLeaderboardRow[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!KOL_PROGRAM_ENABLED) return
    let cancelled = false
    void (async () => {
      const board = await fetchKolProgramLeaderboard(50)
      const meta = await fetchKolProgramSeasons()
      if (cancelled) return
      if (!board) {
        setLoadError('Leaderboard is not available.')
        return
      }
      setRows(board.rows)
      setSeasonId(board.seasonId)
      setDisclaimer(board.disclaimer)
      if (meta) setSeasons(meta.seasons)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function onPickArchive(id: string) {
    setArchiveSeason(id)
    const meta = await fetchKolProgramSeasons(id)
    setArchiveRows(meta?.archive ?? [])
  }

  if (!KOL_PROGRAM_ENABLED) {
    return (
      <div className="app-shell page-kols">
        <section className="section section-kols">
          <p className="section-sub">KOL program leaderboard is not enabled on this build.</p>
          <Link className="btn btn-ghost btn-sm" to="/register">Register</Link>
        </section>
      </div>
    )
  }

  const displayRows = archiveSeason ? archiveRows : rows

  return (
    <div className="app-shell page-kols page-kol-leaderboard">
      <section className="section section-kols">
        <div className="kols-page-head">
          <div className="launch-page-head-row">
            <Link className="launch-back" to="/register">← Register</Link>
            <p className="section-label">KOL program · v{CREW_VERSION}</p>
          </div>
          <h1 className="section-title">Leaderboard</h1>
          <p className="section-sub">
            Monthly season points from daily X tasks. {disclaimer || 'Points have no monetary value.'}
          </p>
          {seasonId && !archiveSeason ? (
            <p className="hint">Current season: <strong>{seasonId.replace(/^season_/, '')}</strong></p>
          ) : null}
        </div>

        {seasons.some((s) => s.archivedAt) ? (
          <div className="kol-program-seasons" aria-label="Past seasons">
            <p className="section-label">Past seasons</p>
            <div className="register-actions">
              {seasons
                .filter((s) => s.archivedAt)
                .map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`btn btn-ghost btn-sm${archiveSeason === s.id ? ' is-active' : ''}`}
                    onClick={() => void onPickArchive(s.id)}
                  >
                    {s.name}
                  </button>
                ))}
              {archiveSeason ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setArchiveSeason(null)
                    setArchiveRows([])
                  }}
                >
                  Current
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {loadError ? <p className="register-err">{loadError}</p> : null}

        <ol className="kol-leaderboard-list">
          {displayRows.map((r) => {
            const founder = founderLabel(r.founderNumber)
            return (
              <li key={`${archiveSeason || 'live'}-${r.rank}-${r.handle}`} className="kol-leaderboard-row">
                <span className="kol-leaderboard-rank">{r.rank}</span>
                <span className="kol-leaderboard-handle">
                  <Link to={kolProfilePath(r.handle)}>@{r.handle}</Link>
                  {founder ? <span className="kol-founder-badge" title="Founding KOL">Founder {founder}</span> : null}
                </span>
                <span className="kol-leaderboard-tier">{r.tier}</span>
                <span className="kol-leaderboard-points">{r.seasonPoints} pts</span>
                <span className="kol-leaderboard-reach">Reach {r.reachScore}</span>
              </li>
            )
          })}
        </ol>

        {!displayRows.length && !loadError ? (
          <p className="hint">No scores yet. Sign in with X on the register page to join.</p>
        ) : null}
      </section>
    </div>
  )
}
