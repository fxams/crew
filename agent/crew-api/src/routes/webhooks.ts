import { Router } from 'express'
import { z } from 'zod'
import { requireAgentApiKey } from '../lib/auth.js'
import {
  ALLOWED_EVENTS,
  createWebhook,
  deleteWebhook,
  listWebhooks,
} from '../lib/webhooks.js'
import { assertPublicHostname, assertSafeHttpUrl } from '../lib/agent/safe-url.js'
import { sendInternalError } from '../lib/http-error.js'

export const webhooksRouter = Router()

const createSchema = z.object({
  url: z.string().url().max(512),
  events: z.array(z.string()).min(1).max(12),
  label: z.string().max(64).optional(),
})

webhooksRouter.get('/webhooks/events', (_req, res) => {
  res.json({ ok: true, events: ALLOWED_EVENTS })
})

webhooksRouter.get('/webhooks', requireAgentApiKey, async (req, res) => {
  try {
    const agentKeyId = req.crewAgentAuth?.source === 'db' ? req.crewAgentAuth.keyId || null : null
    const webhooks = await listWebhooks(agentKeyId ?? undefined)
    res.json({ ok: true, scoped: Boolean(agentKeyId), webhooks })
  } catch (err) {
    sendInternalError(res, err, 'list webhooks')
  }
})

webhooksRouter.post('/webhooks', requireAgentApiKey, async (req, res) => {
  try {
    const body = createSchema.parse(req.body)
    assertSafeHttpUrl(body.url, 'webhook url')
    await assertPublicHostname(new URL(body.url).hostname, 'webhook url')
    const agentKeyId = req.crewAgentAuth?.source === 'db' ? req.crewAgentAuth.keyId || null : null
    const created = await createWebhook({ ...body, agentKeyId })
    res.status(201).json({
      ok: true,
      webhook: created.webhook,
      secret: created.secret,
      tip:
        'Store the secret once — verify x-crew-signature as HMAC-SHA256(ts + "." + body) with x-crew-timestamp. Set CREW_WEBHOOK_LEGACY_SIG=1 on the server to enable legacy sha256(secret + "." + body).',
    })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'create failed' })
  }
})

webhooksRouter.delete('/webhooks/:id', requireAgentApiKey, async (req, res) => {
  try {
    const scope =
      req.crewAgentAuth?.source === 'db' ? { agentKeyId: req.crewAgentAuth.keyId || null } : undefined
    const ok = await deleteWebhook(String(req.params.id || ''), scope)
    if (!ok) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json({ ok: true })
  } catch (err) {
    sendInternalError(res, err, 'delete webhook')
  }
})
