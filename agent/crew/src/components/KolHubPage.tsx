import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CREW_VERSION, KOL_PROGRAM_ENABLED } from '../lib/config'
import { founderLabel, hubRecentJoiners, hubStatTiles } from '../lib/kol-hub-display'
import {
  fetchKolProgramHub,
  fetchKolProgramLeaderboard,
  fetchKolProgramMe,
  fetchKolProgramTasksToday,
  fetchPublicKolCard,
  verifyKolProgramTask,
  KOL_PROGRAM_POINTS_DISCLAIMER,
  type KolLeaderboardRow,
  type KolProgramHub,
  type KolProgramProfile,
  type KolProgramTask,
  type PublicKolCard,
} from '../lib/kol-program'
import { kolTierDisplayName } from '../lib/kol-tiers'
import { startKolHubXSignIn } from '../lib/kol-x-sign-in'
import { kolProfilePath } from '../lib/routes'
import { KolSampleCardPreview } from './KolSampleCardPreview'
import { KolOnboardingChecklist } from './KolOnboardingChecklist'
import { KolBattlesPanel } from './KolBattlesPanel'
import { fetchKolNotifications, markKolNotificationsRead } from '../lib/kol-program'
import { KolInfluenceCard } from './KolInfluenceCard'
import { KolHubDashboard } from './KolHubDashboard'
import { KolMobileTabBar } from './KolMobileTabBar'
import { KolNotionalFormulaNote } from './KolNotionalFormulaNote'
import { KolLeaderboardEmpty } from './KolLeaderboardEmpty'
import { KolBoardRow } from './KolBoardRow'
import { KolSeasonPodium } from './KolSeasonPodium'

export function KolHubPage() {
  const navigate = useNavigate()
  const [hub, setHub] = useState<KolProgramHub | null>(null)
  const [profile, setProfile] = useState<KolProgramProfile | null>(null)
  const [tasks, setTasks] = useState<KolProgramTask[]>([])
  const [signInBusy, setSignInBusy] = useState(false)
  const [taskBusy, setTaskBusy] = useState<string | null>(null)
  const [taskError, setTaskError] = useState<string | null>(null)
  const [lookupHandle, setLookupHandle] = useState('')
  const [pinnedPostId, setPinnedPostId] = useState<string | null>(null)
  const [notifUnread, setNotifUnread] = useState(0)
  const [notifs, setNotifs] = useState<
    Array<{ id: string; title: string; body: string; href: string | null }>
  >([])
  const [publicCard, setPublicCard] = useState<PublicKolCard | null>(null)
  const [boardRows, setBoardRows] = useState<KolLeaderboardRow[] | null>(null)

  const refresh = useCallback(async () => {
    const [h, me, today, board] = await Promise.all([
      fetchKolProgramHub(),
      fetchKolProgramMe(),
      fetchKolProgramTasksToday(),
      fetchKolProgramLeaderboard(50),
    ])
    setBoardRows(board?.rows ?? [])
    setHub(h)
    setProfile(me)
    setTasks(today?.tasks ?? [])
    if (me?.handle) {
      const pub = await fetchPublicKolCard(me.handle)
      setPublicCard(pub?.card ?? null)
      setPinnedPostId(pub?.pinnedPostId ?? null)
      const n = await fetchKolNotifications()
      if (n) {
        setNotifUnread(n.unread)
        setNotifs(n.items.slice(0, 8))
      }
    }
  }, [])

  useEffect(() => {
    if (!KOL_PROGRAM_ENABLED) return
    void refresh()
  }, [refresh])

  const joiners = useMemo(() => hubRecentJoiners(hub?.recentJoiners), [hub?.recentJoiners])
  const statTiles = useMemo(() => hubStatTiles(hub), [hub])
  const ownHandle = profile?.handle ?? null

  async function onSignIn() {
    setSignInBusy(true)
    try {
      await startKolHubXSignIn()
    } catch {
      setSignInBusy(false)
    }
  }

  async function onVerify(taskId: string) {
    setTaskBusy(taskId)
    setTaskError(null)
    const result = await verifyKolProgramTask(taskId)
    setTaskBusy(null)
    if (!result.ok) {
      setTaskError(result.error || 'Verify failed.')
      return
    }
    void refresh()
  }

  if (!KOL_PROGRAM_ENABLED) {
    return (
      <div className="app-shell page-kols">
        <section className="section">
          <p className="section-sub">KOL program is not enabled on this build.</p>
          <Link className="btn btn-ghost btn-sm" to="/register">Register</Link>
        </section>
      </div>
    )
  }

  const disclaimer = hub?.disclaimer || KOL_PROGRAM_POINTS_DISCLAIMER

  function onLookupSubmit(e: React.FormEvent) {
    e.preventDefault()
    const h = lookupHandle.replace(/^@+/, '').trim()
    if (h.length < 1) return
    navigate(kolProfilePath(h))
  }

  return (
    <div className="app-shell page-kol-hub">
      <section className="section kol-hub-hero">
        <p className="section-label">CrewPay KOL · v{CREW_VERSION}</p>
        <h1 className="kol-hub-title">Your reach has a season.</h1>

        <nav className="kol-hub-subnav" aria-label="KOL program">
          <Link className="btn btn-primary btn-sm" to="/kol/leaderboard" data-testid="kol-hub-leaderboard-link">
            Leaderboard
          </Link>
          <Link className="btn btn-ghost btn-sm" to="/kol/founders">Founders</Link>
          <Link className="btn btn-ghost btn-sm" to="/tasks">Tasks</Link>
          {profile ? (
            <Link className="btn btn-ghost btn-sm" to={kolProfilePath(profile.handle)} data-testid="kol-hub-my-card">
              My card
            </Link>
          ) : null}
          {profile && notifUnread > 0 ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm kol-notif-badge"
              onClick={() => void markKolNotificationsRead().then(() => setNotifUnread(0))}
            >
              Alerts ({notifUnread})
            </button>
          ) : null}
        </nav>

        {profile && publicCard ? (
          <div className="kol-hub-showcase" data-testid="kol-hub-showcase" id="card">
            <KolInfluenceCard card={publicCard} portrait />
            <KolNotionalFormulaNote />
            <p className="kol-hub-card-meta kol-hub-card-meta-hero">
              <strong>@{profile.handle}</strong> · {kolTierDisplayName(profile.tier)} · Reach {profile.reachScore}
              {founderLabel(profile.founderNumber)
                ? ` · Founding KOL ${founderLabel(profile.founderNumber)}`
                : ''}
            </p>
          </div>
        ) : null}

        <section className="kol-hub-leaderboard" id="leaderboard" data-testid="kol-hub-leaderboard">
          {boardRows && boardRows.length > 0 ? (
            <>
              <p className="section-label">Season points</p>
              <KolSeasonPodium rows={boardRows} highlightHandle={ownHandle} />
              <ol className="kol-leaderboard-list">
                {boardRows.map((r) => (
                  <KolBoardRow
                    key={r.handle}
                    kind="ranked"
                    row={r}
                    highlight={Boolean(ownHandle && r.handle.toLowerCase() === ownHandle.toLowerCase())}
                  />
                ))}
              </ol>
              <p className="hint">
                <Link to="/kol/leaderboard">Full leaderboard</Link>
              </p>
            </>
          ) : (
            <KolLeaderboardEmpty showSignIn={!profile} />
          )}
        </section>

        {statTiles.length ? (
          <div className="kol-hub-stats" data-testid="kol-hub-stats">
            {statTiles.map((tile) => (
              <p key={tile.label} className="kol-hub-stat">
                <strong>{tile.value}</strong>
                <span>{tile.label}</span>
              </p>
            ))}
          </div>
        ) : null}

        {joiners.length ? (
          <section className="kol-hub-joiners" data-testid="kol-hub-joiners" aria-label="Just joined">
            <p className="section-label">Just joined</p>
            <ol className="kol-leaderboard-list">
              {joiners.map((j) => (
                <KolBoardRow
                  key={`${j.handle}-${j.enrolledAt}`}
                  kind="joiner"
                  row={j}
                  highlight={Boolean(ownHandle && j.handle.toLowerCase() === ownHandle.toLowerCase())}
                />
              ))}
            </ol>
          </section>
        ) : null}

        <form className="kol-handle-lookup" onSubmit={onLookupSubmit} data-testid="kol-handle-lookup">
          <label>
            Check any handle
            <input
              type="search"
              placeholder="@username"
              value={lookupHandle}
              onChange={(e) => setLookupHandle(e.target.value)}
              autoComplete="off"
            />
          </label>
          <button type="submit" className="btn btn-ghost btn-sm">Go</button>
        </form>

        {!profile ? (
          <div className="kol-hub-showcase" data-testid="kol-hub-showcase">
            <KolSampleCardPreview />
          </div>
        ) : profile && !publicCard ? (
          <p className="muted">Loading your card…</p>
        ) : null}

        {!profile && boardRows && boardRows.length > 0 ? (
          <div className="register-actions kol-hub-cta kol-hub-cta-primary">
            <button
              type="button"
              className="btn btn-primary kol-hub-signin"
              data-testid="kol-hub-sign-in-x"
              disabled={signInBusy}
              onClick={() => void onSignIn()}
            >
              {signInBusy ? 'Opening X…' : 'Sign in with X'}
            </button>
          </div>
        ) : null}

        {profile ? (
          <div className="register-actions kol-hub-cta">
            <Link className="btn btn-ghost btn-sm" to={kolProfilePath(profile.handle)}>Full desk</Link>
          </div>
        ) : null}

        <p className="section-sub kol-hub-lead">{disclaimer}</p>
      </section>

      {profile && notifs.length ? (
        <section className="section kol-notifications" id="alerts">
          <p className="section-label">Notifications</p>
          <ul>
            {notifs.map((n) => (
              <li key={n.id}>
                <strong>{n.title}</strong> — {n.body}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {profile ? (
        <section className="section kol-hub-dashboard-wrap" id="tasks">
          <KolOnboardingChecklist />
          <KolBattlesPanel />
          <KolHubDashboard
            profile={profile}
            hub={hub}
            tasks={tasks}
            taskBusy={taskBusy}
            taskError={taskError}
            onVerify={onVerify}
            shareTag=""
            replyPinned={false}
            pinnedPostId={pinnedPostId}
          />
        </section>
      ) : null}
      <KolMobileTabBar />
    </div>
  )
}
