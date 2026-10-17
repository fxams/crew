import { Link, useLocation } from 'react-router-dom'

const TABS = [
  { to: '/kol', label: 'Home', icon: '⌂' },
  { to: '/kol/leaderboard', label: 'Board', icon: '◎' },
  { to: '/kol#alerts', label: 'Alerts', icon: '◉' },
  { to: '/kol#tasks', label: 'Tasks', icon: '≡' },
] as const

export function KolMobileTabBar() {
  const loc = useLocation()
  const path = loc.pathname + loc.hash

  return (
    <nav className="kol-mobile-tabbar" aria-label="KOL area">
      {TABS.map((t) => {
        const active =
          t.to === '/kol'
            ? path === '/kol' || path.startsWith('/kol?')
            : path.startsWith(t.to.replace(/#.*$/, ''))
        return (
          <Link key={t.to} to={t.to} className={active ? 'is-active' : undefined}>
            <span aria-hidden>{t.icon}</span>
            <span>{t.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
