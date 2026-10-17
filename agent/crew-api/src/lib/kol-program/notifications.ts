import { randomBytes } from 'node:crypto'
import { query } from '../db.js'

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
