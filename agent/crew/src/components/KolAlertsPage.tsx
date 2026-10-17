import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { KOL_PROGRAM_ENABLED } from '../lib/config'
import {
  fetchKolNotifications,
  fetchKolProgramMe,
  markKolNotificationsRead,
  type KolNotificationItem,
} from '../lib/kol-program'
import { startKolHubXSignIn } from '../lib/kol-x-sign-in'
import { KolMobileTabBar } from './KolMobileTabBar'

type Tab = 'all' | 'replies' | 'points'

function iconGlyph(icon: KolNotificationItem['icon'] | undefined): string {
  if (icon === 'person') return '＋'
  if (icon === 'heart') return '♡'
  if (icon === 'trophy') return '🏆'
  if (icon === 'key') return '⚿'
  return '✓'
}

export function KolAlertsPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const [items, setItems] = useState<KolNotificationItem[]>([])
  const [tab, setTab] = useState<Tab>('all')
  const [signInBusy, setSignInBusy] = useState(false)

  useEffect(() => {
    if (!KOL_PROGRAM_ENABLED) return
    let cancelled = false
    void (async () => {
      const me = await fetchKolProgramMe()
      if (cancelled) return
      if (!me) {
        setSignedIn(false)
        setItems([])
        return
      }
      setSignedIn(true)
      const n = await fetchKolNotifications()
      if (cancelled) return
      setItems(n?.items ?? [])
      if (n?.unread) void markKolNotificationsRead()
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const visible = useMemo(() => {
    if (tab === 'all') return items
    return items.filter((n) => n.tab === tab)
  }, [items, tab])

  async function onSignIn() {
    setSignInBusy(true)
    try {
      await startKolHubXSignIn({ returnPath: '/kol/alerts' })
    } catch {
      setSignInBusy(false)
    }
  }

  if (!KOL_PROGRAM_ENABLED) {
    return (
      <div className="app-shell page-kols">
        <p className="section-sub">KOL program is not enabled.</p>
      </div>
    )
  }

  return (
    <div className="app-shell page-kol-alerts">
      <section className="section kol-alerts" data-testid="kol-alerts-page">
        <h1 className="kol-alerts-title">Notifications</h1>
        <div className="kol-underline-tabs" role="tablist" aria-label="Notification filters">
          {(['all', 'replies', 'points'] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? 'is-active' : undefined}
              onClick={() => setTab(id)}
            >
              {id === 'all' ? 'All' : id === 'replies' ? 'Replies' : 'Points'}
            </button>
          ))}
        </div>

        {signedIn === false ? (
          <div className="kol-alerts-empty" data-testid="kol-alerts-signed-out">
            <p>Sign in with X to see real alerts — task verifications, referral joins, rank changes, and battles.</p>
            <button
              type="button"
              className="btn btn-primary"
              data-testid="kol-alerts-sign-in-x"
              disabled={signInBusy}
              onClick={() => void onSignIn()}
            >
              {signInBusy ? 'Opening X…' : 'Sign in with X'}
            </button>
          </div>
        ) : visible.length === 0 ? (
          <p className="kol-alerts-empty" data-testid="kol-alerts-empty">
            No notifications yet. Completing tasks and referral joins show up here.
          </p>
        ) : (
          <ol className="kol-alerts-list">
            {visible.map((n) => (
              <li key={n.id} className={n.readAt ? 'is-read' : undefined} data-testid="kol-alert-row">
                <span className={`kol-alerts-icon is-${n.icon || 'check'}`} aria-hidden>
                  {iconGlyph(n.icon)}
                </span>
                <div className="kol-alerts-body">
                  {n.avatars?.length ? (
                    <div className="kol-alerts-avatars">
                      {n.avatars.map((a) =>
                        a.url ? (
                          <img key={a.handle} src={a.url} alt="" referrerPolicy="no-referrer" />
                        ) : (
                          <span key={a.handle} className="kol-alerts-avatar-fallback">
                            {(a.handle[0] || '?').toUpperCase()}
                          </span>
                        ),
                      )}
                      {n.extraCount ? <span className="kol-alerts-extra">+{n.extraCount}</span> : null}
                    </div>
                  ) : null}
                  <p className="kol-alerts-line">
                    <strong>{n.title}</strong>
                    {n.points != null ? <span className="kol-alerts-pts">+{n.points.toLocaleString()} pts</span> : null}
                    <span className="kol-alerts-time"> · {n.timeAgo}</span>
                  </p>
                  {n.body && n.icon !== 'check' ? <p className="kol-alerts-sub">{n.body}</p> : null}
                </div>
                {n.href ? <Link className="kol-alerts-link" to={n.href} aria-label={n.title} /> : null}
              </li>
            ))}
          </ol>
        )}
      </section>
      <KolMobileTabBar />
    </div>
  )
}
