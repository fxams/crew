import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CREW_VERSION, KOL_PROGRAM_ENABLED } from '../lib/config'
import { hubMemberLine, hubRecentJoiners } from '../lib/kol-hub-display'
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

function founderLabel(n: number | null): string | null {
  if (n == null || n < 1) return null
  return `#${String(n).padStart(3, '0')}`
}

function foundingCountdown(iso: string | null): string {
  if (!iso) return 'Founding snapshot TBA'
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'Founding snapshot locked'
  const d = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  return `${d}d ${h}h to founding snapshot`
}

function seasonCountdown(endsAt: string | null): string {
  if (!endsAt) return 'Season active'
  const ms = new Date(endsAt).getTime() - Date.now()
  if (ms <= 0) return 'Season ending soon'
  const d = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  return `${d}d ${h}h left`
}

export function KolHubPage() {
  const navigate = useNavigate()
  const [hub, setHub] = useState<KolProgramHub | null>(null)
  const [profile, setProfile] = useState<KolProgramProfile | null>(null)
  const [tasks, setTasks] = useState<KolProgramTask[]>([])
  const [signInBusy, setSignInBusy] = useState(false)
  const [taskBusy, setTaskBusy] = useState<string | null>(null)
  const [taskError, setTaskError] = useState<string | null>(null)
  const [tickerIdx, setTickerIdx] = useState(0)
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
      fetchKolProgramLeaderboard(3),
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

  useEffect(() => {
    if (joiners.length < 2) return
    const id = window.setInterval(() => setTickerIdx((i) => (i + 1) % joiners.length), 3500)
    return () => window.clearInterval(id)
  }, [joiners])

  const ticker = joiners.length ? joiners[tickerIdx % joiners.length] : null
  const memberLine = hubMemberLine(hub)

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
          <Link className="btn btn-ghost btn-sm" to="/kol/leaderboard">Leaderboard</Link>
          <Link className="btn btn-ghost btn-sm" to="/kol/founders">Founders</Link>
          <Link className="btn btn-ghost btn-sm" to="/tasks">Tasks</Link>
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

        <section className="kol-hub-leaderboard" id="leaderboard" data-testid="kol-hub-leaderboard">
          {boardRows && boardRows.length > 0 ? (
            <>
              <p className="section-label">Season leaderboard</p>
              <ol className="kol-leaderboard-list">
                {boardRows.map((r) => (
                  <li key={r.handle} className="kol-leaderboard-row">
                    <span className="kol-leaderboard-rank">{r.rank}</span>
                    <span className="kol-leaderboard-handle">
                      <Link to={kolProfilePath(r.handle)}>@{r.handle}</Link>
                    </span>
                    <span className="kol-leaderboard-points">{r.seasonPoints} pts</span>
                  </li>
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

        <div className="kol-hub-showcase" data-testid="kol-hub-showcase">
          {profile && publicCard ? (
            <>
              <KolInfluenceCard card={publicCard} portrait />
              <KolNotionalFormulaNote />
            </>
          ) : profile ? (
            <p className="muted">Loading your card…</p>
          ) : (
            <KolSampleCardPreview />
          )}
        </div>

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

        {profile ? (
          <p className="kol-hub-card-meta kol-hub-card-meta-hero">
            <strong>@{profile.handle}</strong> · {kolTierDisplayName(profile.tier)} · Reach {profile.reachScore}
            {founderLabel(profile.founderNumber)
              ? ` · Founding KOL ${founderLabel(profile.founderNumber)}`
              : ''}
          </p>
        ) : null}

        <p className="section-sub kol-hub-lead">{disclaimer}</p>

        {hub ? (
          <div className="kol-hub-stats">
            {memberLine.primary ? (
              <p className="kol-hub-stat">
                <strong>{memberLine.primary}</strong>
                {memberLine.secondary ? <span>{memberLine.secondary}</span> : null}
              </p>
            ) : null}
            <p className="kol-hub-stat">
              <strong>{seasonCountdown(hub.seasonEndsAt)}</strong>
              <span>this season</span>
            </p>
            <p className="kol-hub-stat">
              <strong>{foundingCountdown(hub.foundingSnapshotAt ?? null)}</strong>
              <span>founding</span>
            </p>
          </div>
        ) : null}

        {ticker ? (
          <p className="kol-hub-ticker" aria-live="polite">
            <span className="kol-hub-ticker-label">Just joined</span>
            <span className="kol-hub-ticker-handle">@{ticker.handle}</span>
            {ticker.founderNumber ? (
              <span className="kol-founder-badge">Founder {founderLabel(ticker.founderNumber)}</span>
            ) : null}
          </p>
        ) : null}
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
