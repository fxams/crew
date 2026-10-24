import { Router } from 'express'
import { squadsActivityCardPng } from '../lib/squads-share.js'
import {
  SQUADS_CACHE_CONTROL,
  chartsUpstreamUrl,
  copyUpstreamUrl,
  dashboardUpstreamUrl,
  fetchSquadsUpstream,
  squadsUpstreamOrigin,
  tokenChartUpstreamUrl,
  validateMint,
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

squadsRouter.get('/squads/charts', async (_req, res) => {
  const origin = squadsUpstreamOrigin()
  if (!origin) {
    notConfigured(res)
    return
  }
  const result = await fetchSquadsUpstream('charts', chartsUpstreamUrl(origin))
  if (!result.ok) {
    res.setHeader('Cache-Control', 'no-store')
    res.status(result.status).json({ error: result.error })
    return
  }
  res.setHeader('Cache-Control', SQUADS_CACHE_CONTROL)
  res.json(result.body)
})

squadsRouter.get('/squads/token-chart', async (req, res) => {
  const origin = squadsUpstreamOrigin()
  if (!origin) {
    notConfigured(res)
    return
  }
  const squadId = validateSquadId(req.query.squad)
  const mint = validateMint(req.query.mint)
  if (!squadId || !mint) {
    res.setHeader('Cache-Control', 'no-store')
    res.status(400).json({ error: !squadId ? 'invalid squad' : 'invalid mint' })
    return
  }
  const result = await fetchSquadsUpstream(
    `token-chart:${squadId}:${mint}`,
    tokenChartUpstreamUrl(origin, squadId, mint),
  )
  if (!result.ok) {
    res.setHeader('Cache-Control', 'no-store')
    res.status(result.status).json({ error: result.error })
    return
  }
  res.setHeader('Cache-Control', SQUADS_CACHE_CONTROL)
  res.json(result.body)
})

squadsRouter.get('/squads/activity-card.png', async (req, res) => {
  const origin = squadsUpstreamOrigin()
  if (!origin) {
    notConfigured(res)
    return
  }
  const squadId = validateSquadId(req.query.squad)
  const mint = validateMint(req.query.mint)
  if (!squadId || !mint) {
    res.setHeader('Cache-Control', 'no-store')
    res.status(400).json({ error: !squadId ? 'invalid squad' : 'invalid mint' })
    return
  }
  try {
    const png = await squadsActivityCardPng(squadId, mint)
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'public, max-age=120')
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    res.send(png)
  } catch {
    res.setHeader('Cache-Control', 'no-store')
    res.status(503).json({ error: 'Squads feed is unavailable.' })
  }
})
