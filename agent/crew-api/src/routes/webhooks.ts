import { Router } from 'express'
import { z } from 'zod'
import { requireAgentApiKey, requireApiKey } from '../lib/auth.js'
import {
  ALLOWED_EVENTS,
  createWebhook,
  deleteWebhook,
  listWebhooks,
} from '../lib/webhooks.js'
import { assertSafeHttpUrl } from '../lib/agent/safe-url.js'

export const webhooksRouter = Router()

const createSchema = z.object({
  url: z.string().url().max(512),
  events: z.array(z.string()).min(1).max(12),
  label: z.string().max(64).optional(),
})

webhooksRouter.get('/webhooks/events', (_req, res) => {
  res.json({ ok: true, events: ALLOWED_EVENTS })
})

webhooksRouter.get('/webhooks', requireAgentApiKey, async (_req, res) => {
  try {
    const webhooks = await listWebhooks()
    res.json({ ok: true, webhooks })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'list failed' })
  }
})

webhooksRouter.post('/webhooks', requireAgentApiKey, async (req, res) => {
  try {
    const body = createSchema.parse(req.body)
    assertSafeHttpUrl(body.url, 'webhook url')
    const created = await createWebhook(body)
    res.status(201).json({
      ok: true,
      webhook: created.webhook,
      secret: created.secret,
      tip: 'Store the secret once — used to verify x-crew-signature = sha256(secret + "." + body).',
    })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'create failed' })
  }
})

webhooksRouter.delete('/webhooks/:id', requireApiKey, async (req, res) => {
  try {
    const ok = await deleteWebhook(String(req.params.id || ''))
    if (!ok) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'delete failed' })
  }
})
