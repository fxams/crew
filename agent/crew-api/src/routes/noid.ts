import { Router, type Request, type Response } from 'express'
import { requireAgentApiKey } from '../lib/auth.js'
import {
  noidKitEnabled,
  noidKitUrls,
  noidPublicJson,
  proxyNoidRead,
  type NoidKitProxyView,
} from '../lib/noid-kit.js'

export const noidRouter = Router()

function proxyOffBody() {
  const urls = noidKitUrls()
  return {
    ok: false,
    error: 'NOID kit proxy is off',
    fix: 'Set NOID_KIT_ENABLED=1 and NOID_KIT_API_KEY on crewpay-api. Agents can still connect to the kit directly.',
    site: urls.site,
    mcp: urls.mcp,
    page: 'https://crewpay.dev/noid',
  }
}

noidRouter.get('/noid', async (_req, res) => {
  try {
    res.json(await noidPublicJson())
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'noid failed' })
  }
})

async function handleProxy(view: NoidKitProxyView, req: Request, res: Response) {
  try {
    if (!noidKitEnabled()) {
      res.status(503).json(proxyOffBody())
      return
    }
    const limitRaw = typeof req.query.limit === 'string' ? req.query.limit.trim() : ''
    const limit = limitRaw ? Number(limitRaw) : undefined
    if (limit != null && (!Number.isFinite(limit) || limit < 1 || limit > 100)) {
      res.status(400).json({ error: 'limit must be 1–100' })
      return
    }
    const threshold =
      typeof req.query.threshold_micronoid === 'string'
        ? req.query.threshold_micronoid.trim()
        : undefined
    const data = await proxyNoidRead(view, {
      limit: limit != null ? Math.floor(limit) : undefined,
      thresholdMicronoid: threshold || undefined,
    })
    res.json({
      ok: true,
      view,
      utc: new Date().toISOString(),
      data,
      note: 'Read-only proxy of NOID Agent Kit. CrewPay never takes custody. Independent tooling — not affiliated with Parano1d.',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'noid proxy failed'
    const status = /off/i.test(message) ? 503 : 502
    res.status(status).json({ ok: false, error: message, page: 'https://crewpay.dev/noid' })
  }
}

noidRouter.get('/noid/whale-moves', requireAgentApiKey, async (req, res) => {
  await handleProxy('whale_moves', req, res)
})

noidRouter.get('/noid/new-tokens', requireAgentApiKey, async (req, res) => {
  await handleProxy('new_tokens', req, res)
})
