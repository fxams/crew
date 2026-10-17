import { useCallback, useEffect, useState } from 'react'
import {
  fetchKolOnboarding,
  skipKolOnboardingTelegram,
  verifyKolOnboardingStep,
  KOL_PROGRAM_POINTS_DISCLAIMER,
  type OnboardingStep,
} from '../lib/kol-program'

export function KolOnboardingChecklist() {
  const [steps, setSteps] = useState<OnboardingStep[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const data = await fetchKolOnboarding()
    if (data?.steps) setSteps(data.steps)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function onVerify(stepId: string) {
    setBusy(stepId)
    setError(null)
    const result = await verifyKolOnboardingStep(stepId)
    setBusy(null)
    if (!result.ok) {
      setError(result.error || 'Verify failed.')
      return
    }
    void refresh()
  }

  async function onSkipTelegram() {
    setBusy('telegram')
    await skipKolOnboardingTelegram()
    setBusy(null)
    void refresh()
  }

  if (!steps.length) return null

  return (
    <section className="section kol-onboarding" data-testid="kol-onboarding">
      <p className="section-label">Onboarding</p>
      <p className="hint">Complete each step on X (or your desk) to unlock the next. One-time points per step.</p>
      <ol className="kol-onboarding-list">
        {steps.map((s) => (
          <li key={s.id} className={s.completed ? 'is-done' : s.unlocked ? '' : 'is-locked'}>
            <span>{s.title}</span>
            <span className="kol-onboarding-pts">+{s.points} pts</span>
            {s.completed ? (
              <span className="register-ok">Done</span>
            ) : s.unlocked ? (
              s.id === 'telegram' ? (
                <div className="kol-onboarding-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy === 'telegram'}
                    onClick={() => void onSkipTelegram()}
                  >
                    Skip
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busy === s.id}
                    onClick={() => void onVerify(s.id)}
                  >
                    {busy === s.id ? 'Checking…' : 'Verify'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy === s.id}
                  onClick={() => void onVerify(s.id)}
                >
                  {busy === s.id ? 'Checking…' : 'Verify'}
                </button>
              )
            ) : (
              <span className="hint">Locked</span>
            )}
          </li>
        ))}
      </ol>
      {error ? <p className="register-err">{error}</p> : null}
      <p className="section-sub">{KOL_PROGRAM_POINTS_DISCLAIMER}</p>
    </section>
  )
}
