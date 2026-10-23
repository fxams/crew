import { Router } from 'express'
import {
  SQUADS_CACHE_CONTROL,
  copyUpstreamUrl,
  dashboardUpstreamUrl,
  fetchSquadsUpstream,
  squadsUpstreamOrigin,
  validateSquadId,
} from '../lib/squads-proxy.js'

export const squadsRouter = Router()

function notConfigured(res: import('express').Response): boolean {
  if (squadsUpstreamOrigin()) return false
  res.setHeader('Cache-Control', 'no-store')
  res.status(503).json({ error: 'squads feed not configured' })
  return true
}

squadsRouter.get('/squads/dashboard', async (_req, res) => {
  const origin = squadsUpstreamOrigin()
  if (!origin) {
    notConfigured(res)
    return
  }
  const result = await fetchSquadsUpstream('dashboard', dashboardUpstreamUrl(origin))
  if (!result.ok) {
    res.setHeader('Cache-Control', 'no-store')
    res.status(result.status).json({ error: result.error })
    return
  }
  res.setHeader('Cache-Control', SQUADS_CACHE_CONTROL)
  res.json(result.body)
})

squadsRouter.get('/squads/copy', async (req, res) => {
  const origin = squadsUpstreamOrigin()
  if (!origin) {
    notConfigured(res)
    return
  }
  const squadId = validateSquadId(req.query.squad)
  if (!squadId) {
    res.setHeader('Cache-Control', 'no-store')
    res.status(400).json({ error: 'invalid squad' })
    return
  }
  const result = await fetchSquadsUpstream(`copy:${squadId}`, copyUpstreamUrl(origin, squadId))
  if (!result.ok) {
    res.setHeader('Cache-Control', 'no-store')
    res.status(result.status).json({ error: result.error })
    return
  }
  res.setHeader('Cache-Control', SQUADS_CACHE_CONTROL)
  res.json(result.body)
})
