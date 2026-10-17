export type KolMobileTabId = 'home' | 'board' | 'card' | 'alerts' | 'tasks'

export function kolMobileTabActive(
  pathname: string,
  hash: string,
  tab: KolMobileTabId,
  ownHandle?: string | null,
): boolean {
  const path = (pathname || '/').replace(/\/+$/, '') || '/'
  const h = (hash || '').replace(/^#/, '')
  if (tab === 'board') return path === '/kol/leaderboard' || path.endsWith('/kol/leaderboard')
  if (tab === 'card') {
    const handle = ownHandle?.trim().replace(/^@+/, '')
    if (!handle) return false
    return path.toLowerCase() === `/kol/${handle.toLowerCase()}`
  }
  if (tab === 'alerts') return path === '/kol/alerts' || path.endsWith('/kol/alerts') || (path === '/kol' && h === 'alerts')
  if (tab === 'tasks') return path === '/kol/tasks' || path.endsWith('/kol/tasks') || (path === '/kol' && h === 'tasks')
  return path === '/kol' && h !== 'alerts' && h !== 'tasks'
}
