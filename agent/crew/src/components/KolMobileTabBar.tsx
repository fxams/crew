import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { kolMobileTabActive, type KolMobileTabId } from '../lib/kol-mobile-tab'
import { fetchKolProgramMe } from '../lib/kol-program'
import { kolProfilePath } from '../lib/routes'

type Tab = {
  id: KolMobileTabId
  to: string
  label: string
  icon: string
  testId: string
}

export function KolMobileTabBar() {
  const loc = useLocation()
  const [ownHandle, setOwnHandle] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchKolProgramMe().then((me) => {
      if (!cancelled) setOwnHandle(me?.handle ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const tabs: Tab[] = [
    { id: 'home', to: '/kol', label: 'Home', icon: '⌂', testId: 'kol-tab-home' },
    { id: 'board', to: '/kol/leaderboard', label: 'Board', icon: '◎', testId: 'kol-tab-board' },
    ...(ownHandle
      ? [
          {
            id: 'card' as const,
            to: kolProfilePath(ownHandle),
            label: 'My card',
            icon: '▣',
            testId: 'kol-tab-card',
          },
        ]
      : []),
    { id: 'alerts', to: '/kol#alerts', label: 'Alerts', icon: '◉', testId: 'kol-tab-alerts' },
    { id: 'tasks', to: '/kol/tasks', label: 'Tasks', icon: '≡', testId: 'kol-tab-tasks' },
  ]

  return (
    <nav className="kol-mobile-tabbar" aria-label="KOL area">
      {tabs.map((t) => (
        <Link
          key={t.id}
          to={t.to}
          data-testid={t.testId}
          className={kolMobileTabActive(loc.pathname, loc.hash, t.id, ownHandle) ? 'is-active' : undefined}
        >
          <span aria-hidden>{t.icon}</span>
          <span>{t.label}</span>
        </Link>
      ))}
    </nav>
  )
}
