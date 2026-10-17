import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CREW_VERSION, KOL_PROGRAM_ENABLED } from '../lib/config'
import {
  fetchKolProgramHub,
  fetchKolProgramMe,
  fetchKolProgramTasksToday,
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

function shareTweetUrl(referralUrl: string, cardUrl: string): string {
  const text = `My CrewPay KOL card — reach score + season points. Join with my link (points have no cash value).`
  const params = new URLSearchParams({
    text: `${text}\n${referralUrl}\n`,
    url: cardUrl,
  })
  return `https://twitter.com/intent/tweet?${params.toString()}`
}

export function KolHubPage() {
  const [hub, setHub] = useState<KolProgramHub | null>(null)
  const [profile, setProfile] = useState<KolProgramProfile | null>(null)
  const [tasks, setTasks] = useState<KolProgramTask[]>([])
  const [signInBusy, setSignInBusy] = useState(false)
  const [taskBusy, setTaskBusy] = useState<string | null>(null)
  const [taskError, setTaskError] = useState<string | null>(null)
  const [tickerIdx, setTickerIdx] = useState(0)

  const refresh = useCallback(async () => {
    const [h, me, today] = await Promise.all([
      fetchKolProgramHub(),
      fetchKolProgramMe(),
      fetchKolProgramTasksToday(),
    ])
    setHub(h)
    setProfile(me)
    setTasks(today?.tasks?.filter((t) => !t.completed) ?? today?.tasks ?? [])
  }, [])

  useEffect(() => {
    if (!KOL_PROGRAM_ENABLED) return
    void refresh()
  }, [refresh])

  useEffect(() => {
    const joiners = hub?.recentJoiners ?? []
    if (joiners.length < 2) return
    const id = window.setInterval(() => setTickerIdx((i) => (i + 1) % joiners.length), 3500)
    return () => window.clearInterval(id)
  }, [hub?.recentJoiners])

  const ticker = hub?.recentJoiners?.[tickerIdx]

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

  return (
    <div className="app-shell page-kol-hub">
      <section className="section kol-hub-hero">
        <p className="section-label">CrewPay KOL · v{CREW_VERSION}</p>
        <h1 className="kol-hub-title">Your reach has a season.</h1>
        <p className="section-sub kol-hub-lead">
          Sign in with X for your card, daily tasks, and the season leaderboard.{' '}
          {disclaimer}
        </p>
        <div className="kol-hub-stats">
          <p className="kol-hub-stat">
            <strong>{hub ? hub.memberCount.toLocaleString() : '—'}</strong>
            <span>members</span>
          </p>
          <p className="kol-hub-stat">
            <strong>{seasonCountdown(hub?.seasonEndsAt ?? null)}</strong>
            <span>this season</span>
          </p>
        </div>
        {ticker ? (
          <p className="kol-hub-ticker" aria-live="polite">
            <span className="kol-hub-ticker-label">Just joined</span>
            <span className="kol-hub-ticker-handle">@{ticker.handle}</span>
            {ticker.founderNumber ? (
              <span className="kol-founder-badge">Founder {founderLabel(ticker.founderNumber)}</span>
            ) : null}
          </p>
        ) : null}

        {!profile ? (
          <div className="register-actions kol-hub-cta">
            <button
              type="button"
              className="btn btn-primary kol-hub-signin"
              data-testid="kol-hub-sign-in-x"
              disabled={signInBusy}
              onClick={() => void onSignIn()}
            >
              {signInBusy ? 'Opening X…' : 'Sign in with X'}
            </button>
            <Link className="btn btn-ghost" to="/kol/leaderboard">Leaderboard</Link>
          </div>
        ) : null}
      </section>

      {profile ? (
        <>
          <section className={`section kol-hub-card-reveal ${tierClass}`} data-testid="kol-hub-card">
            <p className="section-label">Your KOL card</p>
            <div className={`kol-hub-card-frame ${tierClass}`}>
              <img
                className="kol-hub-card-img"
                src={cardPng}
                alt={`KOL card for @${profile.handle}`}
                width={600}
                height={315}
              />
            </div>
            <p className="kol-hub-card-meta">
              <strong>@{profile.handle}</strong> · {kolTierDisplayName(profile.tier)} · Reach{' '}
              {profile.reachScore}
              {founderLabel(profile.founderNumber)
                ? ` · Founding KOL ${founderLabel(profile.founderNumber)}`
                : ''}
            </p>
            <p className="hint">{profile.referralUrl}</p>
            <div className="register-actions">
              <a
                className="btn btn-primary btn-sm"
                href={shareTweetUrl(profile.referralUrl, cardPng)}
                target="_blank"
                rel="noreferrer"
              >
                Share on X
              </a>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copyReferral()}>
                Copy link
              </button>
              <Link className="btn btn-ghost btn-sm" to={kolProfilePath(profile.handle)}>Full desk</Link>
            </div>
          </section>

          <section className="section kol-hub-dashboard">
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

            <Link className="btn btn-ghost btn-sm" to="/kol/leaderboard">Season leaderboard & Hall of Fame</Link>
          </section>
        </>
      ) : null}
    </div>
  )
}
