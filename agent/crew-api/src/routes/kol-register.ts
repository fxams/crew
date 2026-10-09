import { Router, type Request } from 'express'
import { z } from 'zod'
import { takeRateLimit } from '../lib/agent/rate-limit.js'
import {
  beginXAuth,
  completeXCallback,
  issueNonce,
  listRegistered,
  siteUrl,
  xOAuthConfigured,
} from '../lib/kol-register.js'

export const kolRegisterRouter = Router()

const solanaAddress = z.string().min(32).max(64)

function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for']
  const raw = Array.isArray(fwd) ? fwd[0] : fwd
  if (typeof raw === 'string' && raw.trim()) return raw.split(',')[0]!.trim()
  return req.ip || 'unknown'
}

kolRegisterRouter.get('/kols/register/status', (_req, res) => {
  res.json({
    xOauth: xOAuthConfigured(),
    redirectUri: process.env.X_REDIRECT_URI?.trim() || 'https://api.crewpay.dev/api/kols/register/callback',
    requires: ['solana wallet signature', 'x oauth'],
  })
})

kolRegisterRouter.get('/kols/registered', async (req, res) => {
  try {
    const limit = Number(req.query.limit || 50)
    const board = await listRegistered(limit)
    res.json({ ok: true, ...board })
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'list failed' })
  }
})

kolRegisterRouter.post('/kols/register/nonce', async (req, res) => {
  try {
    const ip = clientIp(req)
    const gate = takeRateLimit(`kolreg:nonce:${ip}`, { limit: 20, windowMs: 60_000 })
    if (!gate.ok) {
      res.status(429).json({ ok: false, error: 'Slow down and retry.' })
      return
    }
    const { wallet } = z.object({ wallet: solanaAddress }).parse(req.body)
    const issued = await issueNonce(wallet)
    res.json({ ok: true, ...issued })
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'nonce failed' })
  }
})

kolRegisterRouter.post('/kols/register/start', async (req, res) => {
  try {
    const ip = clientIp(req)
    const gate = takeRateLimit(`kolreg:start:${ip}`, { limit: 10, windowMs: 60_000 })
    if (!gate.ok) {
      res.status(429).json({ ok: false, error: 'Slow down and retry.' })
      return
    }
    const body = z
      .object({
        wallet: solanaAddress,
        message: z.string().min(20).max(400),
        signature: z.string().min(64).max(128),
      })
      .parse(req.body)
    const out = await beginXAuth(body)
    res.json({ ok: true, authorizeUrl: out.authorizeUrl })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'start failed'
    const status = /not configured/i.test(msg) ? 503 : 400
    res.status(status).json({ ok: false, error: msg })
  }
})

kolRegisterRouter.get('/kols/register/callback', async (req, res) => {
  const site = siteUrl()
  const code = typeof req.query.code === 'string' ? req.query.code : ''
  const state = typeof req.query.state === 'string' ? req.query.state : ''
  const oauthError = typeof req.query.error === 'string' ? req.query.error : ''
  if (oauthError) {
    res.redirect(`${site}/register?error=${encodeURIComponent(oauthError)}`)
    return
  }
  if (!code || !state) {
    res.redirect(`${site}/register?error=${encodeURIComponent('Missing X authorization code')}`)
    return
  }
  try {
    const saved = await completeXCallback(code, state)
    res.redirect(
      `${site}/register?registered=1&handle=${encodeURIComponent(saved.xUsername)}`,
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Registration failed'
    res.redirect(`${site}/register?error=${encodeURIComponent(msg.slice(0, 180))}`)
  }
})
