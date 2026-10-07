import { Router } from 'express'
import { countKols } from '../lib/kols.js'
import { query } from '../lib/db.js'

export const healthRouter = Router()

healthRouter.get('/healthz', async (_req, res) => {
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
    res.status(503).json({
      ok: false,
      error: err instanceof Error ? err.message : 'db down',
    })
  }
})
