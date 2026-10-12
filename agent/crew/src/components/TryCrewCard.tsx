import { useState } from 'react'
import { Link } from 'react-router-dom'
import { kolProfilePath } from '../lib/routes'
import { useLaunchVenues } from '../lib/use-launch-venues'
import { unsignedLaunchCurl, type LaunchPlatform } from '../lib/platforms'

const API = (
  (import.meta.env.VITE_CREW_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'https://api.crewpay.dev'
)

type Hire = { handle: string; sharePctOfCrewPool: number; effectiveBps: number; registered: boolean }

/**
 * Live, no-wallet demo of Autohire on the homepage. Calls the read-only
 * /api/agent/quickstart endpoint (creates nothing, spends nothing).
 */
export function TryCrewCard() {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [hires, setHires] = useState<Hire[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [platform, setPlatform] = useState<LaunchPlatform>('pumpfun')
  const venues = useLaunchVenues()

  async function run(e?: React.FormEvent) {
    e?.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      const idea = name.trim() || 'Night Owl, an owl meme coin for night-shift degens'
      const [n, ...rest] = idea.split(/[,—-]/)
      const qs = new URLSearchParams({
        name: n.trim().slice(0, 32) || 'Night Owl',
        ticker: n.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() || 'HOOT',
        description: (rest.join(' ').trim() || idea).slice(0, 200),
      })
      const res = await fetch(`${API}/api/agent/quickstart?${qs}`)
      const body = (await res.json()) as { crew?: Hire[]; error?: string }
      if (!res.ok) throw new Error(body.error || 'Preview failed')
      setHires(body.crew || [])
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Preview failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="hero-token try-crew" aria-label="Try Autohire">
      <p className="section-label">Try Autohire · no wallet</p>
      <form onSubmit={(e) => void run(e)} className="try-crew-form">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Coin idea, e.g. Night Owl, owl meme coin"
          maxLength={120}
          aria-label="Coin idea"
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          {busy ? 'Picking…' : 'Pick my crew'}
        </button>
      </form>
      {err ? <p className="register-err">{err}</p> : null}
      {hires ? (
        <ol className="try-crew-list">
          {hires.map((h) => (
            <li key={h.handle}>
              <Link to={kolProfilePath(h.handle.replace(/^@/, ''))}>{h.handle}</Link>
              {h.registered ? <span className="kol-verified"> ✓</span> : null}
              <span>{(h.effectiveBps / 100).toFixed(0)}% of fees</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="hint">See which KOLs an agent would hire for your coin and what share each gets. Nothing is created.</p>
      )}
      <div className="plat-filter" aria-label="Launch venues">
        {venues.map((v) => (
          <button
            key={v.id}
            type="button"
            className={`plat-filter-btn${platform === v.id ? ' is-on' : ''}`}
            disabled={!v.enabled}
            onClick={() => setPlatform(v.id)}
            title={v.caption || v.name}
          >
            {v.name}
            {v.caption ? ` · ${v.caption}` : ''}
          </button>
        ))}
      </div>
      <details className="details-quiet">
        <summary>Agent unsigned · {venues.find((v) => v.id === platform)?.name}</summary>
        <pre>{unsignedLaunchCurl({ platform, name })}</pre>
      </details>
      <p className="hint">
        Agents: <code>GET api.crewpay.dev/api/agent/quickstart</code> ·{' '}
        <Link to="/agents">3-call launch →</Link>
      </p>
    </aside>
  )
}
