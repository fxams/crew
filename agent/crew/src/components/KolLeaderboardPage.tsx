import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CREW_VERSION, KOL_PROGRAM_ENABLED } from '../lib/config'
import {
  fetchHallOfFameAll,
  fetchKolProgramLeaderboard,
  fetchKolProgramSeasons,
  type HallOfFameEntry,
  type KolLeaderboardRow,
  type KolPoolStatus,
  type KolProgramSeason,
  hofBadgeLabel,
} from '../lib/kol-program'
import { kolProfilePath } from '../lib/routes'

function founderLabel(n: number | null): string | null {
  if (n == null || n < 1) return null
  return `#${String(n).padStart(3, '0')}`
}

function formatPoolSol(n: number): string {
  if (n >= 1) return `${n.toFixed(3)} SOL`
  if (n > 0) return `${(n * 1000).toFixed(1)} mSOL`
  return '0 SOL'
}

export function KolLeaderboardPage() {
  const [rows, setRows] = useState<KolLeaderboardRow[]>([])
  const [seasonId, setSeasonId] = useState<string>('')
  const [disclaimer, setDisclaimer] = useState('')
  const [crewPriorityCopy, setCrewPriorityCopy] = useState('')
  const [pool, setPool] = useState<KolPoolStatus | null>(null)
  const [seasons, setSeasons] = useState<KolProgramSeason[]>([])
  const [archiveSeason, setArchiveSeason] = useState<string | null>(null)
  const [archiveRows, setArchiveRows] = useState<KolLeaderboardRow[]>([])
  const [archiveHof, setArchiveHof] = useState<HallOfFameEntry[]>([])
  const [hofSeasons, setHofSeasons] = useState<
    Array<{ seasonId: string; seasonNumber: number; name: string; top: HallOfFameEntry[] }>
  >([])
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!KOL_PROGRAM_ENABLED) return
    let cancelled = false
    void (async () => {
      const [board, meta, hof] = await Promise.all([
        fetchKolProgramLeaderboard(50),
        fetchKolProgramSeasons(),
        fetchHallOfFameAll(),
      ])
      if (cancelled) return
      if (!board) {
        setLoadError('Leaderboard is not available.')
        return
      }
      setRows(board.rows)
      setSeasonId(board.seasonId)
      setDisclaimer(board.disclaimer)
      setCrewPriorityCopy(board.crewPriorityCopy || '')
      setPool(board.pool || null)
      if (meta) setSeasons(meta.seasons)
      setHofSeasons(hof)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function onPickArchive(id: string) {
    setArchiveSeason(id)
    const meta = await fetchKolProgramSeasons(id)
    setArchiveRows(meta?.archive ?? [])
    setArchiveHof(meta?.hallOfFame ?? [])
  }

  const hofByHandle = useMemo(() => {
    const map = new Map<string, HallOfFameEntry>()
    for (const e of archiveHof) {
      map.set(e.handle.toLowerCase(), e)
    }
    return map
  }, [archiveHof])

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
          {crewPriorityCopy ? <p className="hint kol-priority-copy">{crewPriorityCopy}</p> : null}
          {seasonId && !archiveSeason ? (
            <p className="hint">Current season: <strong>{seasonId.replace(/^season_/, '')}</strong></p>
          ) : null}
        </div>

        {pool && !archiveSeason ? (
          <div className="kol-pool-status" aria-label="Season treasury pool">
            <p className="section-label">Treasury pool (so far this season)</p>
            <p className="hint">{pool.copy}</p>
            <p className="hint">
              Indexed receipts: {formatPoolSol(pool.receipts.solana.sol)}
              {pool.receipts.base.eth > 0 ? ` · ${pool.receipts.base.eth.toFixed(4)} ETH` : ''}
              {' · '}
              Pool slice ({pool.poolBps / 100}%): {formatPoolSol(pool.poolSlice.solana.sol)}
              {pool.poolSlice.base.eth > 0 ? ` · ${pool.poolSlice.base.eth.toFixed(4)} ETH` : ''}
            </p>
            <p className="hint kol-program-disclaimer">{pool.disclaimer}</p>
          </div>
        ) : null}

        {hofSeasons.length ? (
          <div className="kol-hall-of-fame" aria-label="Season hall of fame">
            <p className="section-label">Hall of Fame</p>
            <p className="hint">Top 10 each season — badges stay on KOL cards and desks.</p>
            {hofSeasons.map((s) => (
              <div key={s.seasonId} className="kol-hof-season">
                <h2 className="section-title register-board-title">{s.name}</h2>
                <ol className="kol-leaderboard-list kol-hof-list">
                  {s.top.map((e) => (
                    <li key={`${s.seasonId}-${e.rank}`} className="kol-leaderboard-row">
                      <span className="kol-leaderboard-rank">{e.rank}</span>
                      <span className="kol-leaderboard-handle">
                        <Link to={kolProfilePath(e.handle)}>@{e.handle}</Link>
                        <span className="kol-hof-badge">{hofBadgeLabel(e.seasonNumber)}</span>
                      </span>
                      <span className="kol-leaderboard-points">{e.seasonPoints} pts</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        ) : null}

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
                    setArchiveHof([])
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
            const hof = archiveSeason ? hofByHandle.get(r.handle.toLowerCase()) : null
            return (
              <li key={`${archiveSeason || 'live'}-${r.rank}-${r.handle}`} className="kol-leaderboard-row">
                <span className="kol-leaderboard-rank">{r.rank}</span>
                <span className="kol-leaderboard-handle">
                  <Link to={kolProfilePath(r.handle)}>@{r.handle}</Link>
                  {founder ? <span className="kol-founder-badge" title="Founding KOL">Founder {founder}</span> : null}
                  {hof ? (
                    <span className="kol-hof-badge">{hofBadgeLabel(hof.seasonNumber)}</span>
                  ) : null}
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
