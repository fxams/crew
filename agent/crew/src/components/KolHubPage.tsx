import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CREW_VERSION, KOL_PROGRAM_ENABLED } from '../lib/config'
import { hubMemberLine, hubRecentJoiners } from '../lib/kol-hub-display'
import {
  fetchKolProgramHub,
  fetchKolProgramMe,
  fetchKolProgramTasksToday,
  fetchPublicKolCard,
  kolProgramCardUrl,
  verifyKolProgramTask,
  KOL_PROGRAM_POINTS_DISCLAIMER,
  type KolProgramHub,
  type KolProgramProfile,
  type KolProgramTask,
} from '../lib/kol-program'
import { kolTierDisplayName, kolTierFrameClass } from '../lib/kol-tiers'
import { startKolHubXSignIn } from '../lib/kol-x-sign-in'
import { kolProfilePath } from '../lib/routes'
import { KolSampleCardPreview } from './KolSampleCardPreview'
import { buildKolGrowthShareTweet } from '../lib/kol-share'
import { KolOnboardingChecklist } from './KolOnboardingChecklist'

function founderLabel(n: number | null): string | null {
  if (n == null || n < 1) return null
  return `#${String(n).padStart(3, '0')}`
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
  const [shareTag, setShareTag] = useState('')
  const [replyPinned, setReplyPinned] = useState(false)
  const [pinnedPostId, setPinnedPostId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const [h, me, today] = await Promise.all([
      fetchKolProgramHub(),
      fetchKolProgramMe(),
      fetchKolProgramTasksToday(),
    ])
    setHub(h)
    setProfile(me)
    setTasks(today?.tasks?.filter((t) => !t.completed) ?? today?.tasks ?? [])
    if (me?.handle) {
      const pub = await fetchPublicKolCard(me.handle)
      setPinnedPostId(pub?.pinnedPostId ?? null)
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

  const milestones = useMemo(() => {
    const count = profile?.referralCount ?? 0
    const defs = hub?.referralMilestones ?? [
      { referrals: 5, bonusPoints: 1000 },
      { referrals: 25, bonusPoints: 5000 },
      { referrals: 100, bonusPoints: 25000 },
    ]
    return defs.map((m) => ({
      ...m,
      done: count >= m.referrals,
      progress: Math.min(100, Math.round((count / m.referrals) * 100)),
    }))
  }, [hub?.referralMilestones, profile?.referralCount])

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

  async function copyReferral() {
    if (!profile?.referralUrl) return
    try {
      await navigator.clipboard.writeText(profile.referralUrl)
    } catch {
      /* ignore */
    }
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
  const tierClass = profile ? kolTierFrameClass(profile.tier) : 'kol-tier-spark'
  const cardPng = profile ? kolProgramCardUrl(profile.handle, 'png') : ''
  const shareUrl =
    profile
      ? buildKolGrowthShareTweet({
          refLink: profile.referralUrl,
          tagHandle: shareTag || undefined,
          replyToPostId: replyPinned && pinnedPostId ? pinnedPostId : undefined,
        })
      : ''

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
          {profile ? (
            <div className={`kol-hub-card-frame kol-hub-card-frame-hero ${tierClass}`} data-testid="kol-hub-card">
              <img
                className="kol-hub-card-img kol-hub-card-img-hero"
                src={cardPng}
                alt={`KOL card for @${profile.handle}`}
                width={600}
                height={315}
              />
            </div>
          ) : (
            <KolSampleCardPreview />
          )}
        </div>

        {!profile ? (
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
        ) : (
          <div className="register-actions kol-hub-cta">
            <label className="kol-share-tag">
              Tag a friend
              <input
                type="text"
                placeholder="@handle"
                value={shareTag}
                onChange={(e) => setShareTag(e.target.value)}
              />
            </label>
            {pinnedPostId ? (
              <label className="kol-share-reply">
                <input
                  type="checkbox"
                  checked={replyPinned}
                  onChange={(e) => setReplyPinned(e.target.checked)}
                />
                Reply under pinned post
              </label>
            ) : null}
            <a className="btn btn-primary btn-sm" href={shareUrl} target="_blank" rel="noreferrer">
              Share on X
            </a>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copyReferral()}>
              Copy link
            </button>
            <Link className="btn btn-ghost btn-sm" to={kolProfilePath(profile.handle)}>Full desk</Link>
          </div>
        )}

        {profile ? (
          <p className="kol-hub-card-meta kol-hub-card-meta-hero">
            <strong>@{profile.handle}</strong> · {kolTierDisplayName(profile.tier)} · Reach {profile.reachScore}
            {founderLabel(profile.founderNumber)
              ? ` · Founding KOL ${founderLabel(profile.founderNumber)}`
              : ''}
          </p>
        ) : null}

        <p className="section-sub kol-hub-lead">{disclaimer}</p>

        <nav className="kol-hub-subnav" aria-label="KOL program">
          <Link className="btn btn-ghost btn-sm" to="/kol/leaderboard">Leaderboard</Link>
          <Link className="btn btn-ghost btn-sm" to="/tasks">Tasks</Link>
        </nav>

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

      {profile ? (
        <section className="section kol-hub-dashboard">
          <KolOnboardingChecklist />
          <p className="section-label">Dashboard</p>
          <div className="kol-hub-dash-grid">
            <div className="kol-hub-dash-card">
              <span className="kol-hub-dash-label">Season points</span>
              <strong>{profile.seasonPoints}</strong>
            </div>
            <div className="kol-hub-dash-card">
              <span className="kol-hub-dash-label">Rank</span>
              <strong>{profile.rank ? `#${profile.rank}` : '—'}</strong>
            </div>
            <div className="kol-hub-dash-card">
              <span className="kol-hub-dash-label">Referrals</span>
              <strong>{profile.referralCount ?? 0}</strong>
            </div>
          </div>

          {tasks[0] ? (
            <div className="kol-hub-task">
              <p className="section-label">Today&apos;s task</p>
              <p><strong>{tasks[0].title}</strong> · {tasks[0].points} pts</p>
              <p className="hint">{tasks[0].instructions}</p>
              {tasks[0].completed ? (
                <p className="register-ok">Completed today</p>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={taskBusy === tasks[0].id}
                  onClick={() => void onVerify(tasks[0].id)}
                >
                  {taskBusy === tasks[0].id ? 'Checking X…' : 'Verify'}
                </button>
              )}
              {taskError ? <p className="register-err">{taskError}</p> : null}
            </div>
          ) : null}

          <div className="kol-hub-milestones">
            <p className="section-label">Referral milestones</p>
            <p className="hint">Bonus season points when you hit each tier (paid once).</p>
            <ul className="kol-milestone-list">
              {milestones.map((m) => (
                <li key={m.referrals} className={m.done ? 'is-done' : ''}>
                  <span>{m.referrals} referrals</span>
                  <span>+{m.bonusPoints.toLocaleString()} pts</span>
                  <div className="kol-milestone-bar" aria-hidden>
                    <div style={{ width: `${m.progress}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  )
}
