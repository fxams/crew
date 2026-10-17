import { useEffect, useState } from 'react'
import {
  createKolBattle,
  fetchKolBattles,
  stakeKolBattle,
  type KolBattle,
} from '../lib/kol-program'
import { openXUrl } from '../lib/x-links'

export function KolBattlesPanel() {
  const [battles, setBattles] = useState<KolBattle[]>([])
  const [theme, setTheme] = useState('')
  const [opponent, setOpponent] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    const data = await fetchKolBattles()
    setBattles(data?.battles ?? [])
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function onCreate() {
    setBusy(true)
    setError(null)
    const out = await createKolBattle({ theme, opponentHandle: opponent || undefined })
    setBusy(false)
    if (!out.ok) {
      setError(out.error || 'Could not create battle.')
      return
    }
    setTheme('')
    setOpponent('')
    void refresh()
    if (out.shareIntent) openXUrl(out.shareIntent)
  }

  return (
    <section className="section kol-battles" data-testid="kol-battles">
      <p className="section-label">KOL battles</p>
      <p className="hint">
        24h theme posts · winner by engagement rate (likes+replies+reposts / followers). Points
        stakes burn 5%. Spectators back a side with points. No money — points only.
      </p>
      <div className="kol-battle-create">
        <input
          type="text"
          placeholder="Theme (e.g. best meme coin thread)"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
        />
        <input
          type="text"
          placeholder="@opponent (optional — open challenge)"
          value={opponent}
          onChange={(e) => setOpponent(e.target.value)}
        />
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void onCreate()}>
          {busy ? 'Creating…' : 'Open battle'}
        </button>
      </div>
      {error ? <p className="register-err">{error}</p> : null}
      <ul className="kol-battle-list">
        {battles.map((b) => (
          <li key={b.id}>
            <strong>{b.hashtag}</strong> @{b.challengerHandle}
            {b.opponentHandle ? ` vs @${b.opponentHandle}` : ' · open'}
            <span className="hint"> · {b.theme}</span>
            <div className="kol-battle-stake">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void stakeKolBattle(b.id, 'challenger', 50).then(() => refresh())}
              >
                Back challenger (50 pts)
              </button>
              {b.opponentHandle ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => void stakeKolBattle(b.id, 'opponent', 50).then(() => refresh())}
                >
                  Back opponent (50 pts)
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
