import { Router, type Request } from 'express'
import { z } from 'zod'
import { takeRateLimit } from '../lib/agent/rate-limit.js'
import {
  beginXAuth,
  completeXCallback,
  issueNonce,
  listRegistered,
  oauthReturnForState,
  phantomReturnPage,
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
        returnTo: z.enum(['phantom', 'web']).optional(),
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

function finishRegister(
  res: { redirect: (url: string) => void; type: (t: string) => { send: (body: string) => void } },
  returnTo: 'phantom' | 'web',
  nextPath: string,
  page: { heading: string; detail: string },
) {
  if (returnTo === 'phantom') {
    res.type('html').send(phantomReturnPage({ ...page, nextPath }))
    return
  }
  res.redirect(`${siteUrl()}${nextPath}`)
}

kolRegisterRouter.get('/kols/register/callback', async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : ''
  const state = typeof req.query.state === 'string' ? req.query.state : ''
  const oauthError = typeof req.query.error === 'string' ? req.query.error : ''
  const returnTo = await oauthReturnForState(state).catch(() => 'web' as const)
  if (oauthError) {
    const detail = oauthError.slice(0, 180)
    finishRegister(res, returnTo, `/register?error=${encodeURIComponent(detail)}`, {
      heading: 'X sign-in did not finish',
      detail,
    })
    return
  }
  if (!code || !state) {
    const detail = 'Missing X authorization code'
    finishRegister(res, returnTo, `/register?error=${encodeURIComponent(detail)}`, {
      heading: 'X sign-in did not finish',
      detail,
    })
    return
  }
  try {
    const { registration, returnTo: savedReturn } = await completeXCallback(code, state)
    const handle = registration.xUsername
    finishRegister(res, savedReturn, `/register?registered=1&handle=${encodeURIComponent(handle)}`, {
      heading: `Registered @${handle}`,
      detail: 'You are on the tape and the leaderboard. Open Phantom to see it.',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Registration failed'
    const detail = msg.slice(0, 180)
    finishRegister(res, returnTo, `/register?error=${encodeURIComponent(detail)}`, {
      heading: 'Registration failed',
      detail,
    })
  }
})
