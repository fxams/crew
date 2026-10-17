import { startKolHubXSignIn } from '../lib/kol-x-sign-in'
import { useState } from 'react'
import { KolSeasonPodium } from './KolSeasonPodium'

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
      <KolSeasonPodium rows={[]} />
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
