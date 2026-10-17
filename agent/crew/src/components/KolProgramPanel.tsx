import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { KOL_REFERRAL_CUT_PCT } from '../lib/config'
import {
  fetchKolProgramMe,
  fetchKolProgramStatus,
  fetchKolProgramTasksToday,
  formatReachFormulaDoc,
  kolProgramCardUrl,
  verifyKolProgramTask,
  type KolProgramProfile,
  type KolProgramTask,
} from '../lib/kol-program'

type Props = {
  onSignInWithX?: () => void
  signInBusy?: boolean
  xOauthReady?: boolean
}

function founderLabel(n: number | null): string | null {
  if (n == null || n < 1) return null
  return `#${String(n).padStart(3, '0')}`
}

export function KolProgramPanel({ onSignInWithX, signInBusy, xOauthReady }: Props) {
  const [formula, setFormula] = useState<string | null>(null)
  const [feeMap, setFeeMap] = useState<string | null>(null)
  const [disclaimer, setDisclaimer] = useState<string | null>(null)
  const [profile, setProfile] = useState<KolProgramProfile | null>(null)
  const [tasks, setTasks] = useState<KolProgramTask[]>([])
  const [taskBusy, setTaskBusy] = useState<string | null>(null)
  const [taskError, setTaskError] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(false)

  const refresh = useCallback(async () => {
    const status = await fetchKolProgramStatus()
    setEnabled(status.enabled)
    setFormula(formatReachFormulaDoc(status.reachFormula))
    setFeeMap(status.referralFeeMap ?? null)
    setDisclaimer(status.pointsDisclaimer ?? null)
    if (!status.enabled) return
    const me = await fetchKolProgramMe()
    setProfile(me)
    const today = await fetchKolProgramTasksToday()
    setTasks(today?.tasks ?? [])
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (!enabled) return null

  const founder = founderLabel(profile?.founderNumber ?? null)

  async function onVerify(taskId: string) {
    setTaskBusy(taskId)
    setTaskError(null)
    const result = await verifyKolProgramTask(taskId)
    setTaskBusy(null)
    if (!result.ok) {
      setTaskError(result.error || 'Could not verify.')
      return
    }
    void refresh()
  }

  return (
    <aside className="register-kol-program" aria-label="KOL program">
      <p className="section-label">KOL program</p>
      <h2 className="section-title register-board-title">Reach card &amp; daily tasks</h2>
      <p className="section-sub">
        Top KOLs by season points get first crew slots on new launches when eligible. Sign in with X to
        enroll — no wallet required. Share{' '}
        <code>crewpay.dev/ref/&lt;handle&gt;</code> so agent keys bind your referrer split (
        {KOL_REFERRAL_CUT_PCT}% on referred launches; fee map 60/15/{KOL_REFERRAL_CUT_PCT}/20 — not a
        earnings promise).
      </p>
      {disclaimer ? <p className="hint kol-program-disclaimer">{disclaimer}</p> : null}
      {feeMap ? <p className="hint kol-program-fee-map">{feeMap}</p> : null}

      {formula ? (
        <details className="kol-program-formula">
          <summary>Reach score formula (published)</summary>
          <pre className="register-snippet-pre">{formula}</pre>
        </details>
      ) : null}

      {!profile && onSignInWithX ? (
        <div className="register-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            data-testid="kol-program-sign-in-x"
            disabled={signInBusy || xOauthReady === false}
            onClick={() => onSignInWithX()}
          >
            {signInBusy ? 'Waiting…' : 'Sign in with X'}
          </button>
        </div>
      ) : null}

      {profile?.flaggedReason ? (
        <p className="register-err" role="alert">
          Account flagged: {profile.flaggedReason}
        </p>
      ) : null}

      {profile ? (
        <div className="kol-program-card-block">
          <p className="section-label">Your card</p>
          <p>
            <strong>@{profile.handle}</strong> · Reach {profile.reachScore} · {profile.tier}
            {founder ? ` · Founding KOL ${founder}` : ''}
          </p>
          <p className="hint">
            Referral link:{' '}
            <a href={profile.referralUrl} target="_blank" rel="noreferrer">
              {profile.referralUrl}
            </a>
          </p>
          <img
            className="kol-program-card-img"
            src={kolProgramCardUrl(profile.handle, 'png')}
            alt={`CrewPay KOL card for @${profile.handle}`}
            width={600}
            height={315}
            loading="lazy"
          />
          <div className="register-actions">
            <a
              className="btn btn-ghost btn-sm"
              href={kolProgramCardUrl(profile.handle, 'png')}
              download={`crewpay-kol-${profile.handle}.png`}
            >
              Download card
            </a>
            <Link className="btn btn-ghost btn-sm" to="/kol/leaderboard">
              Leaderboard · {profile.seasonPoints} season pts
            </Link>
          </div>
        </div>
      ) : null}

      {profile && !profile.flaggedReason && tasks.length ? (
        <div className="kol-program-tasks">
          <p className="section-label">Today&apos;s task</p>
          {tasks.map((t) => (
            <div key={t.id} className="kol-program-task">
              <p><strong>{t.title}</strong> · {t.points} pts</p>
              <p className="hint">{t.instructions}</p>
              {t.completed ? (
                <p className="register-ok">Completed today</p>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={taskBusy === t.id}
                  onClick={() => void onVerify(t.id)}
                >
                  {taskBusy === t.id ? 'Checking X…' : 'Verify'}
                </button>
              )}
            </div>
          ))}
          {taskError ? <p className="register-err">{taskError}</p> : null}
        </div>
      ) : null}
    </aside>
  )
}
