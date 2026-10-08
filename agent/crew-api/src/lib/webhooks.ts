import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { query } from './db.js'

export type WebhookRow = {
  id: string
  url: string
  events: string[]
  active: boolean
  createdAt: number
}

const ALLOWED_EVENTS = [
  'launch.created',
  'feeShare.locked',
  'remit.cranked',
  'buyback.executed',
  'holderKol.locked',
] as const

export type WebhookEvent = (typeof ALLOWED_EVENTS)[number]

export function isAllowedEvent(e: string): e is WebhookEvent {
  return (ALLOWED_EVENTS as readonly string[]).includes(e)
}

export { ALLOWED_EVENTS }

function newId() {
  return `wh_${randomBytes(8).toString('hex')}`
}

function newSecret() {
  return `whsec_${randomBytes(24).toString('hex')}`
}

export async function createWebhook(opts: {
  url: string
  events: string[]
  label?: string
}): Promise<{ webhook: WebhookRow; secret: string }> {
  const id = newId()
  const secret = newSecret()
  const events = opts.events.filter(isAllowedEvent)
  if (!events.length) throw new Error('Provide at least one valid event')
  await query(
    `INSERT INTO webhooks (id, url, secret, events, label, active)
     VALUES ($1,$2,$3,$4,$5, true)`,
    [id, opts.url, secret, events, opts.label || null],
  )
  return {
    webhook: {
      id,
      url: opts.url,
      events,
      active: true,
      createdAt: Date.now(),
    },
    secret,
  }
}

export async function listWebhooks(): Promise<WebhookRow[]> {
  const { rows } = await query(
    `SELECT id, url, events, active, created_at FROM webhooks ORDER BY created_at DESC LIMIT 100`,
  )
  return rows.map((r) => ({
    id: String(r.id),
    url: String(r.url),
    events: (r.events as string[]) || [],
    active: Boolean(r.active),
    createdAt: new Date(String(r.created_at)).getTime(),
  }))
}

export async function deleteWebhook(id: string): Promise<boolean> {
  const { rowCount } = await query(`DELETE FROM webhooks WHERE id = $1`, [id])
  return (rowCount || 0) > 0
}

function signBody(secret: string, body: string): string {
  return createHash('sha256').update(`${secret}.${body}`).digest('hex')
}

export async function emitWebhookEvent(
  event: WebhookEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  const { rows } = await query(
    `SELECT id, url, secret, events FROM webhooks WHERE active = true`,
  )
  const bodyObj = {
    event,
    at: new Date().toISOString(),
    data: payload,
  }
  const body = JSON.stringify(bodyObj)

  await Promise.all(
    rows.map(async (row) => {
      const events = (row.events as string[]) || []
      if (!events.includes(event) && !events.includes('*')) return
      const secret = String(row.secret)
      const signature = signBody(secret, body)
      let status = 0
      let ok = false
      let detail = ''
      try {
        const res = await fetch(String(row.url), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-crew-event': event,
            'x-crew-signature': signature,
            'user-agent': 'CrewPay-Webhooks/1.0',
          },
          body,
          signal: AbortSignal.timeout(8_000),
        })
        status = res.status
        ok = res.ok
        detail = ok ? 'delivered' : `HTTP ${res.status}`
      } catch (err) {
        detail = err instanceof Error ? err.message : 'delivery failed'
      }
      await query(
        `INSERT INTO webhook_deliveries (webhook_id, event, ok, status_code, detail)
         VALUES ($1,$2,$3,$4,$5)`,
        [row.id, event, ok, status || null, detail.slice(0, 500)],
      )
    }),
  )
}

/** Verify inbound webhook signature (for consumers / tests). */
export function verifyWebhookSignature(secret: string, body: string, signature: string): boolean {
  const expected = Buffer.from(signBody(secret, body))
  const got = Buffer.from(signature)
  if (expected.length !== got.length) return false
  return timingSafeEqual(expected, got)
}
