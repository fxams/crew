import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchKolOnboarding,
  skipKolOnboardingTelegram,
  verifyKolOnboardingStep,
  verifyKolProgramTask,
  type KolProgramTask,
  type OnboardingStep,
} from '../lib/kol-program'
import { CREW_X_URL } from '../lib/config'
import { XLink } from './XLink'
import { KolHubDashboard } from './KolHubDashboard'
import type { KolProgramHub, KolProgramProfile } from '../lib/kol-program'

type Tab = 'tasks' | 'referrals' | 'founding'

type TodayMeta = {
  tasks: KolProgramTask[]
  resetIn?: string
  tweetId?: string | null
  pointsToday?: number
  pointsCap?: number
}

function StartPill({
  busy,
  onClick,
  label = 'Start',
}: {
  busy?: boolean
  onClick: () => void
  label?: string
}) {
  return (
    <button type="button" className="kol-ladder-start" disabled={busy} onClick={onClick}>
      {busy ? '…' : label}
    </button>
  )
}

export function KolTaskLadder({
  profile,
  hub,
  today,
  onSignIn,
}: {
  profile: KolProgramProfile | null
  hub: KolProgramHub | null
  today: TodayMeta
  onSignIn?: () => void
}) {
  const [tab, setTab] = useState<Tab>('tasks')
  const [steps, setSteps] = useState<OnboardingStep[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [capped, setCapped] = useState(false)
  const [pointsToday, setPointsToday] = useState(today.pointsToday ?? profile?.pointsToday ?? 0)
  const cap = today.pointsCap ?? profile?.pointsCap ?? 5000
  const signedIn = Boolean(profile)
  const [todayTasks, setTodayTasks] = useState(today.tasks)

  const refresh = useCallback(async () => {
    const data = await fetchKolOnboarding()
    if (data?.steps) setSteps(data.steps)
    if (data?.pointsToday != null) setPointsToday(data.pointsToday)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    setTodayTasks(today.tasks)
    if (today.pointsToday != null) setPointsToday(today.pointsToday)
  }, [today])

  const doneCount = steps.filter((s) => s.completed).length
  const total = steps.length || 1

  async function onVerifyOnboard(stepId: string) {
    if (!signedIn) {
      onSignIn?.()
      return
    }
    setBusy(stepId)
    setError(null)
    const result = await verifyKolOnboardingStep(stepId)
    setBusy(null)
    if (!result.ok) {
      setError(result.error || (result.pending ? 'Pending verification.' : 'Verify failed.'))
      return
    }
    if (result.capped) setCapped(true)
    void refresh()
  }

  async function onSkipTelegram() {
    setBusy('telegram')
    await skipKolOnboardingTelegram()
    setBusy(null)
    void refresh()
  }

  async function onVerifyToday(taskId: string) {
    if (!signedIn) {
      onSignIn?.()
      return
    }
    setBusy(taskId)
    setError(null)
    const result = await verifyKolProgramTask(taskId)
    setBusy(null)
    if (!result.ok) {
      setError(result.error || 'Pending verification.')
      return
    }
    setTodayTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, completed: true } : t)))
    if (result.points) setPointsToday((n) => n + result.points!)
    void refresh()
  }

  function rowRight(opts: {
    id: string
    completed: boolean
    locked: boolean
    points: number
    telegram?: boolean
  }) {
    if (opts.completed) {
      return (
        <span className="kol-ladder-earned">
          <span aria-hidden>✓</span> points earned
        </span>
      )
    }
    if (opts.locked) {
      return <span className="kol-ladder-locked-pts">+{opts.points.toLocaleString()}</span>
    }
    if (opts.telegram) {
      return (
        <div className="kol-ladder-actions">
          <button type="button" className="kol-ladder-skip" disabled={busy === 'telegram'} onClick={() => void onSkipTelegram()}>
            Skip
          </button>
          <StartPill busy={busy === opts.id} onClick={() => void onVerifyOnboard(opts.id)} />
        </div>
      )
    }
    return <StartPill busy={busy === opts.id} onClick={() => void onVerifyOnboard(opts.id)} />
  }

  return (
    <section className="section kol-ladder" id="tasks" data-testid="kol-task-ladder">
      <div className="kol-ladder-head">
        <p className="section-label">Get started, one step at a time</p>
        <p className="kol-ladder-progress">
          {doneCount} of {total}
        </p>
        <div className="kol-ladder-segments" data-testid="kol-ladder-segments" aria-hidden>
          {Array.from({ length: total }, (_, i) => (
            <i key={i} className={i < doneCount ? 'is-done' : undefined} />
          ))}
        </div>
        <p className="kol-ladder-cap" data-testid="kol-daily-cap">
          {pointsToday.toLocaleString()} / {cap.toLocaleString()} today
        </p>
        {capped ? (
          <p className="hint">Daily task points cap reached. More tomorrow (00:00 UTC).</p>
        ) : null}
        {!signedIn && onSignIn ? (
          <button
            type="button"
            className="btn btn-primary kol-hub-signin"
            data-testid="kol-tasks-sign-in-x"
            onClick={() => onSignIn()}
          >
            Sign in with X
          </button>
        ) : null}
      </div>

      <div className="kol-underline-tabs" role="tablist">
        {(['tasks', 'referrals', 'founding'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'is-active' : undefined}
            onClick={() => setTab(id)}
          >
            {id === 'tasks' ? 'Tasks' : id === 'referrals' ? 'Referrals' : 'Founding'}
          </button>
        ))}
      </div>

      {tab === 'tasks' ? (
        <>
          <ol className="kol-ladder-list">
            {steps.map((s) => {
              const locked = !s.unlocked && !s.completed
              return (
                <li
                  key={s.id}
                  className={s.completed ? 'is-done' : locked ? 'is-locked' : ''}
                  data-testid={`kol-ladder-step-${s.id}`}
                >
                  <span className="kol-ladder-icon" aria-hidden>
                    {s.completed ? '✓' : locked ? '🔒' : s.icon || '•'}
                  </span>
                  <div className="kol-ladder-body">
                    <strong>{s.title}</strong>
                    <p className="hint">
                      {locked ? 'Unlocks after the task above' : s.hint}
                    </p>
                  </div>
                  {rowRight({
                    id: s.id,
                    completed: s.completed || (s.id === 'connect_x' && signedIn),
                    locked,
                    points: s.points,
                    telegram: s.id === 'telegram',
                  })}
                </li>
              )
            })}
          </ol>

          <div className="kol-ladder-today" data-testid="kol-ladder-today">
            <p className="section-label">Today</p>
            {today.resetIn ? <p className="hint">Resets in {today.resetIn} (00:00 UTC)</p> : null}
            {today.tweetId ? (
              <p className="hint">
                Newest @CrewPayHQ post:{' '}
                <XLink href={`${CREW_X_URL}/status/${today.tweetId}`}>Open in X</XLink>
              </p>
            ) : (
              <p className="hint">Today’s @CrewPayHQ post will appear here when available.</p>
            )}
            <ul className="kol-ladder-list">
              {todayTasks.map((t) => {
                const locked = !signedIn || Boolean(t.locked)
                return (
                  <li key={t.id} className={t.completed ? 'is-done' : locked ? 'is-locked' : ''}>
                    <span className="kol-ladder-icon" aria-hidden>
                      {t.completed ? '✓' : locked ? '🔒' : '•'}
                    </span>
                    <div className="kol-ladder-body">
                      <strong>{t.title}</strong>
                      <p className="hint">{t.instructions}</p>
                    </div>
                    {t.completed ? (
                      <span className="kol-ladder-earned">
                        <span aria-hidden>✓</span> points earned
                      </span>
                    ) : locked ? (
                      <span className="kol-ladder-locked-pts">+{t.points.toLocaleString()}</span>
                    ) : (
                      <StartPill busy={busy === t.id} onClick={() => void onVerifyToday(t.id)} />
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
          {error ? <p className="register-err">{error}</p> : null}
        </>
      ) : null}

      {tab !== 'tasks' && signedIn && profile ? (
        <KolHubDashboard
          profile={profile}
          hub={hub}
          tasks={[]}
          taskBusy={null}
          taskError={null}
          onVerify={() => undefined}
          shareTag=""
          replyPinned={false}
          pinnedPostId={null}
        />
      ) : null}

      {tab !== 'tasks' && !signedIn ? (
        <p className="hint">Sign in with X to see {tab}.</p>
      ) : null}

      {tab === 'founding' ? (
        <p className="hint">
          <Link to="/kol/founders">Open the founding list</Link>
        </p>
      ) : null}
    </section>
  )
}
