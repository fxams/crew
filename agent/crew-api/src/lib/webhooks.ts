import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { query } from './db.js'
import { fetchPublicUrl } from './agent/safe-url.js'

export type WebhookRow = {
  id: string
  url: string
  events: string[]
  active: boolean
  createdAt: number
  agentKeyId?: string | null
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
  agentKeyId?: string | null
}): Promise<{ webhook: WebhookRow; secret: string }> {
  const id = newId()
  const secret = newSecret()
  const events = opts.events.filter(isAllowedEvent)
  if (!events.length) throw new Error('Provide at least one valid event')
  if (opts.agentKeyId) {
    const { rows } = await query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM webhooks WHERE agent_key_id = $1`,
      [opts.agentKeyId],
    )
    if (Number(rows[0]?.n || 0) >= 5) {
      throw new Error('Max 5 webhooks per key')
    }
  }
  await query(
    `INSERT INTO webhooks (id, url, secret, events, label, agent_key_id, active)
     VALUES ($1,$2,$3,$4,$5,$6, true)`,
    [id, opts.url, secret, events, opts.label || null, opts.agentKeyId || null],
  )
  return {
    webhook: {
      id,
      url: opts.url,
      events,
      active: true,
      createdAt: Date.now(),
      agentKeyId: opts.agentKeyId || null,
    },
    secret,
  }
}

export async function listWebhooks(agentKeyId?: string | null): Promise<WebhookRow[]> {
  const { rows } =
    agentKeyId != null
      ? await query(
          `SELECT id, url, events, active, agent_key_id, created_at
           FROM webhooks
           WHERE agent_key_id = $1
           ORDER BY created_at DESC LIMIT 100`,
          [agentKeyId],
        )
      : await query(
          `SELECT id, url, events, active, agent_key_id, created_at
           FROM webhooks
           ORDER BY created_at DESC LIMIT 100`,
        )
  return rows.map((r) => ({
    id: String(r.id),
    url: String(r.url),
    events: (r.events as string[]) || [],
    active: Boolean(r.active),
    createdAt: new Date(String(r.created_at)).getTime(),
    agentKeyId: r.agent_key_id ? String(r.agent_key_id) : null,
  }))
}

export async function deleteWebhook(id: string, scope?: { agentKeyId?: string | null }): Promise<boolean> {
  const { rowCount } =
    scope?.agentKeyId != null
      ? await query(`DELETE FROM webhooks WHERE id = $1 AND agent_key_id = $2`, [
          id,
          scope.agentKeyId,
        ])
      : await query(`DELETE FROM webhooks WHERE id = $1`, [id])
  return (rowCount || 0) > 0
}

function hmacSignature(secret: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
}

function legacySignature(secret: string, body: string): string {
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
  const legacy = process.env.CREW_WEBHOOK_LEGACY_SIG === '1' || process.env.CREW_WEBHOOK_LEGACY_SIG === 'true'

  await Promise.all(
    rows.map(async (row) => {
      const events = (row.events as string[]) || []
      if (!events.includes(event) && !events.includes('*')) return
      const secret = String(row.secret)
      const ts = String(Date.now())
      const signature = legacy ? legacySignature(secret, body) : hmacSignature(secret, ts, body)
      let status = 0
      let ok = false
      let detail = ''
      try {
        const res = await fetchPublicUrl(String(row.url), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-crew-event': event,
            'x-crew-signature': signature,
            ...(legacy ? {} : { 'x-crew-timestamp': ts }),
            'user-agent': 'CrewPay-Webhooks/1.0',
          },
          body,
          timeoutMs: 8_000,
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
