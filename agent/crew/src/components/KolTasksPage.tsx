import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { KOL_PROGRAM_ENABLED } from '../lib/config'
import {
  fetchKolProgramHub,
  fetchKolProgramMe,
  fetchKolProgramTasksToday,
  KOL_PROGRAM_POINTS_DISCLAIMER,
  type KolProgramHub,
  type KolProgramProfile,
  type KolProgramTask,
} from '../lib/kol-program'
import { startKolHubXSignIn } from '../lib/kol-x-sign-in'
import { KolMobileTabBar } from './KolMobileTabBar'
import { KolTaskLadder } from './KolTaskLadder'

export function KolTasksPage() {
  const [hub, setHub] = useState<KolProgramHub | null>(null)
  const [profile, setProfile] = useState<KolProgramProfile | null>(null)
  const [tasks, setTasks] = useState<KolProgramTask[]>([])
  const [todayMeta, setTodayMeta] = useState<{
    resetIn?: string
    tweetId?: string | null
    pointsToday?: number
    pointsCap?: number
  }>({ pointsToday: 0, pointsCap: 5000 })
  const [signInBusy, setSignInBusy] = useState(false)

  const refresh = useCallback(async () => {
    const [h, me, today] = await Promise.all([
      fetchKolProgramHub(),
      fetchKolProgramMe(),
      fetchKolProgramTasksToday(),
    ])
    setHub(h)
    setProfile(me)
    setTasks(today?.tasks ?? [])
    setTodayMeta({
      resetIn: today?.resetIn,
      tweetId: today?.tweetId,
      pointsToday: today?.pointsToday ?? me?.pointsToday ?? 0,
      pointsCap: today?.pointsCap ?? me?.pointsCap ?? 5000,
    })
  }, [])

  useEffect(() => {
    if (!KOL_PROGRAM_ENABLED) return
    void refresh()
  }, [refresh])

  async function onSignIn() {
    setSignInBusy(true)
    try {
      await startKolHubXSignIn({ returnPath: '/kol/tasks' })
    } catch {
      setSignInBusy(false)
    }
  }

  if (!KOL_PROGRAM_ENABLED) {
    return (
      <div className="app-shell page-kols">
        <p className="section-sub">KOL program is not enabled.</p>
        <Link className="btn btn-ghost btn-sm" to="/tasks">Open jobs</Link>
      </div>
    )
  }

  return (
    <div className="app-shell page-kol-tasks">
      <section className="section kol-hub-hero">
        <p className="section-label">CrewPay KOL</p>
        <h1 className="kol-hub-title">Task ladder</h1>
        <nav className="kol-hub-subnav" aria-label="KOL program">
          <Link className="btn btn-ghost btn-sm" to="/kol">Hub</Link>
          <Link className="btn btn-ghost btn-sm" to="/kol/leaderboard">Leaderboard</Link>
          <Link className="btn btn-primary btn-sm" to="/kol/tasks">Tasks</Link>
        </nav>
        {signInBusy ? <p className="hint">Opening X…</p> : null}
      </section>
      <KolTaskLadder
        profile={profile}
        hub={hub}
        today={{
          tasks,
          resetIn: todayMeta.resetIn,
          tweetId: todayMeta.tweetId,
          pointsToday: todayMeta.pointsToday,
          pointsCap: todayMeta.pointsCap,
        }}
        onSignIn={() => void onSignIn()}
      />
      <p className="section-sub kol-hub-lead">{KOL_PROGRAM_POINTS_DISCLAIMER}</p>
      <KolMobileTabBar />
    </div>
  )
}
