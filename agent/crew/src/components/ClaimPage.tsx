import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CREW_VERSION } from '../lib/config'
import { claimHandleFromPath, kolProfilePath } from '../lib/routes'

const API = (
  (import.meta.env.VITE_CREW_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'https://api.crewpay.dev'
)

type ClaimPitch = {
  handle: string
  solEarned: number
  remitCount: number
  registered: boolean
  deskPath: string | null
  registerPath: string
  pitch: string
}

function formatSol(n: number) {
  if (!Number.isFinite(n) || n === 0) return '0'
  if (n >= 1) return n.toFixed(3)
  return n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
}

export function ClaimPage() {
  const { pathname } = useLocation()
  const handle = claimHandleFromPath(pathname) || ''
  const [pitch, setPitch] = useState<ClaimPitch | null>(null)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setPitch(null)
    setMissing(false)
    setError(null)
    void (async () => {
      try {
        const res = await fetch(`${API}/api/kols/claim/${encodeURIComponent(handle)}`)
        const body = (await res.json()) as ClaimPitch & { error?: string }
        if (cancelled) return
        if (res.status === 404) {
          setMissing(true)
          return
        }
        if (!res.ok) throw new Error(body.error || 'Could not load claim pitch.')
        setPitch(body)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load claim pitch.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [handle])

  return (
    <div className="app-shell page-kols page-claim">
      <section className="section section-kols">
        <div className="kols-page-head">
          <div className="launch-page-head-row">
            <Link className="launch-back" to="/register">
              ← Register
            </Link>
            <p className="section-label">Claim · v{CREW_VERSION}</p>
          </div>
          <h1 className="section-title">Claim your desk.</h1>
          <p className="section-sub">
            Past CrewPay payouts become a pitch. Register with X + your wallet to own the page.
          </p>
        </div>

        {error ? <p className="register-err">{error}</p> : null}
        {!pitch && !missing && !error ? <p className="section-sub">Loading…</p> : null}

        {missing ? (
          <div className="claim-card">
            <h2 className="desk-name">@{handle}</h2>
            <p className="section-sub">No recorded CrewPay remits for this handle yet.</p>
            <Link className="btn btn-primary" to="/register">
              Register anyway
            </Link>
          </div>
        ) : null}

        {pitch ? (
          <div className="claim-card">
            <p className="desk-kicker">{pitch.registered ? 'Your desk' : 'Unclaimed earnings'}</p>
            <h2 className="desk-name">@{pitch.handle}</h2>
            <p className="claim-sol">
              {formatSol(pitch.solEarned)}
              <span> SOL earned</span>
            </p>
            <p className="section-sub">{pitch.pitch}</p>
            <p className="hint">{pitch.remitCount} recorded payment{pitch.remitCount === 1 ? '' : 's'}.</p>
            <div className="register-actions">
              {pitch.registered && pitch.deskPath ? (
                <Link className="btn btn-primary" to={kolProfilePath(pitch.handle)}>
                  Open desk
                </Link>
              ) : (
                <Link className="btn btn-primary" to="/register">
                  Claim your page
                </Link>
              )}
              <Link className="btn btn-ghost" to="/kols">
                Directory
              </Link>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}
