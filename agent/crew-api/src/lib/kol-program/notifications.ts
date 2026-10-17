import { randomBytes } from 'node:crypto'
import { query } from '../db.js'
import {
  handlesFromNotificationText,
  presentNotificationFeed,
  type PresentedNotification,
} from './notification-feed.js'

export type KolNotification = {
  id: string
  kind: string
  title: string
  body: string
  href: string | null
  createdAt: string
  readAt: string | null
}

function id(prefix: string) {
  return `${prefix}_${randomBytes(8).toString('hex')}`
}

export async function pushNotification(
  xUserId: string,
  kind: string,
  title: string,
  body: string,
  href?: string,
): Promise<void> {
  await query(
    `INSERT INTO kol_program_notifications (id, x_user_id, kind, title, body, href)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [id('kpn'), xUserId, kind, title, body.slice(0, 500), href || null],
  )
}

export async function listNotifications(xUserId: string, limit = 40): Promise<KolNotification[]> {
  const { rows } = await query<Record<string, unknown>>(
    `SELECT id, kind, title, body, href, created_at, read_at
     FROM kol_program_notifications
     WHERE x_user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [xUserId, limit],
  )
  return rows.map((r) => ({
    id: String(r.id),
    kind: String(r.kind),
    title: String(r.title),
    body: String(r.body),
    href: r.href ? String(r.href) : null,
    createdAt: new Date(r.created_at as Date).toISOString(),
    readAt: r.read_at ? new Date(r.read_at as Date).toISOString() : null,
  }))
}

async function avatarsForHandles(handles: string[]): Promise<Record<string, string | null>> {
  const unique = [...new Set(handles.map((h) => h.toLowerCase()).filter(Boolean))]
  if (!unique.length) return {}
  const { rows } = await query<{ x_username: string; profile_image_url: string | null }>(
    `SELECT lower(x_username) AS x_username, profile_image_url
     FROM kol_registrations
     WHERE lower(x_username) = ANY($1::text[])`,
    [unique],
  )
  const map: Record<string, string | null> = {}
  for (const r of rows) map[String(r.x_username)] = r.profile_image_url
  return map
}

export async function listPresentedNotifications(xUserId: string, limit = 40): Promise<PresentedNotification[]> {
  const items = await listNotifications(xUserId, limit)
  const handles = items.flatMap((n) => handlesFromNotificationText(n.title, n.body))
  return presentNotificationFeed(items, await avatarsForHandles(handles))
}

export async function unreadNotificationCount(xUserId: string): Promise<number> {
  const { rows } = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM kol_program_notifications WHERE x_user_id = $1 AND read_at IS NULL`,
    [xUserId],
  )
  return Number(rows[0]?.n || 0)
}

export async function markNotificationsRead(xUserId: string, ids?: string[]): Promise<void> {
  if (ids?.length) {
    await query(
      `UPDATE kol_program_notifications SET read_at = now()
       WHERE x_user_id = $1 AND id = ANY($2::text[])`,
      [xUserId, ids],
    )
    return
  }
  await query(
    `UPDATE kol_program_notifications SET read_at = now() WHERE x_user_id = $1 AND read_at IS NULL`,
    [xUserId],
  )
}
