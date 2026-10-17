import type { KolNotification } from './notifications.js'

export type PresentedNotification = {
  id: string
  kind: string
  tab: 'replies' | 'points'
  icon: 'check' | 'person' | 'heart' | 'trophy' | 'key'
  title: string
  body: string
  href: string | null
  createdAt: string
  readAt: string | null
  timeAgo: string
  points: number | null
  avatars: Array<{ handle: string; url: string | null }>
  extraCount: number
}

export function relativeTimeLabel(iso: string, now = Date.now()): string {
  const ms = now - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return 'now'
  const m = Math.floor(ms / 60_000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export function notificationIcon(kind: string): PresentedNotification['icon'] {
  const k = kind.toLowerCase()
  if (k === 'rank_change' || k.includes('rank')) return 'trophy'
  if (k === 'referral_join' || k.startsWith('referral')) return 'person'
  if (k === 'pinned_like' || k === 'like' || k.includes('liked')) return 'heart'
  if (k.startsWith('battle')) return 'key'
  if (k === 'task_verified' || k.startsWith('task') || k.startsWith('onboarding') || k.startsWith('today')) {
    return 'check'
  }
  return 'check'
}

export function notificationTab(kind: string): PresentedNotification['tab'] {
  if (kind.startsWith('battle')) return 'replies'
  return 'points'
}

export function handlesFromNotificationText(...parts: Array<string | null | undefined>): string[] {
  const found: string[] = []
  const re = /@([A-Za-z0-9_]{1,15})/g
  for (const part of parts) {
    if (!part) continue
    for (const m of part.matchAll(re)) found.push(m[1].toLowerCase())
  }
  return [...new Set(found)]
}

export function pointsFromNotificationText(...parts: Array<string | null | undefined>): number | null {
  for (const part of parts) {
    if (!part) continue
    const m = part.match(/\+(\d[\d,]*)\s*pts/i)
    if (m) return Number(m[1].replace(/,/g, ''))
  }
  return null
}

export function presentNotificationFeed(
  items: KolNotification[],
  avatars: Record<string, string | null> = {},
  now = Date.now(),
): PresentedNotification[] {
  const out: PresentedNotification[] = []
  let i = 0
  while (i < items.length) {
    const cur = items[i]
    if (cur.kind === 'referral_join') {
      const group = [cur]
      while (i + 1 < items.length && items[i + 1].kind === 'referral_join') {
        i += 1
        group.push(items[i])
      }
      const handles = group.flatMap((n) => handlesFromNotificationText(n.title, n.body))
      const first = handles[0] || 'Someone'
      const extra = Math.max(0, handles.length - 1)
      const title =
        extra > 0
          ? `${first} and ${extra} other${extra === 1 ? '' : 's'} joined via your link`
          : `${first} joined via your link`
      out.push({
        id: cur.id,
        kind: cur.kind,
        tab: 'points',
        icon: 'person',
        title,
        body: extra > 0 ? `${handles.length} new joiners` : cur.body,
        href: cur.href,
        createdAt: cur.createdAt,
        readAt: group.every((n) => n.readAt) ? cur.readAt : null,
        timeAgo: relativeTimeLabel(cur.createdAt, now),
        points: null,
        avatars: handles.slice(0, 4).map((handle) => ({ handle, url: avatars[handle] ?? null })),
        extraCount: Math.max(0, handles.length - 4),
      })
      i += 1
      continue
    }
    const handles = handlesFromNotificationText(cur.title, cur.body)
    out.push({
      id: cur.id,
      kind: cur.kind,
      tab: notificationTab(cur.kind),
      icon: notificationIcon(cur.kind),
      title: cur.title,
      body: cur.body,
      href: cur.href,
      createdAt: cur.createdAt,
      readAt: cur.readAt,
      timeAgo: relativeTimeLabel(cur.createdAt, now),
      points: pointsFromNotificationText(cur.title, cur.body),
      avatars: handles.slice(0, 4).map((handle) => ({ handle, url: avatars[handle] ?? null })),
      extraCount: Math.max(0, handles.length - 4),
    })
    i += 1
  }
  return out
}
