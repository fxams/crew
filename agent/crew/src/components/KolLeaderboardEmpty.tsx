import { startKolHubXSignIn } from '../lib/kol-x-sign-in'
import { useState } from 'react'

const PLACES = [
  { place: 2, cls: 'kol-podium-side' },
  { place: 1, cls: 'kol-podium-first' },
  { place: 3, cls: 'kol-podium-side' },
] as const

type Props = {
  heading?: string
  showSignIn?: boolean
}

export function KolLeaderboardEmpty({ heading = 'Season leaderboard', showSignIn = true }: Props) {
  const [busy, setBusy] = useState(false)

  async function onSignIn() {
    setBusy(true)
    try {
      await startKolHubXSignIn()
    } catch {
      setBusy(false)
    }
  }

  return (
    <div className="kol-leaderboard-empty" data-testid="kol-leaderboard-empty">
      {heading ? <p className="section-label">{heading}</p> : null}
      <div className="kol-podium" aria-label="Empty podium">
        {PLACES.map((p) => (
          <div key={p.place} className={`kol-podium-slot ${p.cls} is-placeholder`}>
            <span className="kol-podium-rank">#{p.place}</span>
            <div className="kol-podium-placeholder" aria-hidden />
            <span className="kol-podium-handle">Be the first</span>
          </div>
        ))}
      </div>
      <p className="hint kol-leaderboard-empty-copy">
        No KOLs on the board yet. Points have no cash value.
      </p>
      {showSignIn ? (
        <div className="register-actions kol-hub-cta kol-hub-cta-primary">
          <button
            type="button"
            className="btn btn-primary"
            data-testid="kol-leaderboard-sign-in-x"
            disabled={busy}
            onClick={() => void onSignIn()}
          >
            {busy ? 'Opening X…' : 'Sign in with X'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
