import { Router } from 'express'
import { countKols } from '../lib/kols.js'
import { query } from '../lib/db.js'
import { probeJitoEngines } from '../lib/agent/jito.js'

export const healthRouter = Router()

healthRouter.get(['/health/jito', '/healthz/jito'], async (_req, res) => {
  try {
    const health = await probeJitoEngines()
    res.status(health.ok ? 200 : 503).json({
      ...health,
      service: 'crew-api',
      time: new Date().toISOString(),
    })
  } catch (err) {
    console.error('health jito probe', err)
    res.status(503).json({
      ok: false,
      error: 'jito probe failed',
      time: new Date().toISOString(),
    })
  }
})

healthRouter.get(['/healthz', '/health'], async (_req, res) => {
  try {
    await query('SELECT 1')
    const kols = await countKols()
    res.json({
      ok: true,
      service: 'crew-api',
      kols,
      time: new Date().toISOString(),
    })
  } catch (err) {
    console.error('healthz db check', err)
    res.status(503).json({
      ok: false,
      error: 'db down',
    })
  }
})
