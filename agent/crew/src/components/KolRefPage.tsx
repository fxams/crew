import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { KOL_PROGRAM_ENABLED } from '../lib/config'
import { KOL_PROGRAM_POINTS_DISCLAIMER } from '../lib/kol-program'
import { usePageMeta } from '../lib/page-meta'
import { startKolHubXSignIn } from '../lib/kol-x-sign-in'
import { kolRefPath } from '../lib/routes'

const API = (
  (import.meta.env.VITE_CREW_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'https://api.crewpay.dev'
)

type RefProfile = {
  handle: string
  reachScore: number
  tier: string
  founderNumber: number | null
}

export function KolRefPage({ handle }: { handle: string }) {
  const [profile, setProfile] = useState<RefProfile | null>(null)
  const clean = handle.replace(/^@+/, '')
  const cardUrl = `${API}/api/kol-program/card/${encodeURIComponent(clean)}.png`
  const pageUrl = typeof window !== 'undefined' ? `${window.location.origin}${kolRefPath(clean)}` : ''

  usePageMeta({
    title: `@${clean} · CrewPay KOL`,
    description: `Join the CrewPay KOL program via @${clean}. ${KOL_PROGRAM_POINTS_DISCLAIMER}`,
    ogImage: cardUrl,
    ogUrl: pageUrl,
  })

  useEffect(() => {
    if (!KOL_PROGRAM_ENABLED) return
    void (async () => {
      const res = await fetch(`${API}/api/kol-program/profile/${encodeURIComponent(clean)}`)
      if (!res.ok) return
      const body = (await res.json()) as { profile?: RefProfile }
      if (body.profile) setProfile(body.profile)
    })()
  }, [clean])

  return (
    <div className="app-shell page-kol-ref">
      <section className="section kol-ref-hero">
        <p className="section-label">CrewPay KOL invite</p>
        <h1 className="section-title">@{clean} invited you</h1>
        <p className="section-sub">{KOL_PROGRAM_POINTS_DISCLAIMER}</p>
        {profile ? (
          <img
            className="kol-hub-card-img kol-ref-card"
            src={cardUrl}
            alt={`KOL card @${clean}`}
            width={600}
            height={315}
          />
        ) : (
          <div className="kol-ref-card-placeholder" aria-hidden />
        )}
        <div className="register-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void startKolHubXSignIn({ referralCode: clean })}
          >
            Sign in with X
          </button>
          <Link className="btn btn-ghost" to="/kol">KOL home</Link>
        </div>
      </section>
    </div>
  )
}
