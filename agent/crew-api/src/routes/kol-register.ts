import { Router, type Request } from 'express'
import { z } from 'zod'
import { takeRateLimit } from '../lib/agent/rate-limit.js'
import {
  beginXAuth,
  completeXCallback,
  getClaimPitch,
  getKolProfile,
  getKolProfileByWallet,
  issueNonce,
  KOL_REFERRAL_CUT_PCT,
  listRegistered,
  lookupReferralCuts,
  siteUrl,
  xOAuthConfigured,
} from '../lib/kol-register.js'
import {
  listMentionDrafts,
  setMentionDraftStatus,
} from '../lib/kol-mentions.js'

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
    referral: {
      cutPct: KOL_REFERRAL_CUT_PCT,
      note: 'Every registered KOL gets a referral code. Direct referrals only — 5% of the referred KOL seat when they are hired.',
    },
  })
})

/** Lookup direct referrer wallets for hired crew handles (fee-share preview). */
kolRegisterRouter.get('/kols/referral-cuts', async (req, res) => {
  try {
    const raw = typeof req.query.handles === 'string' ? req.query.handles : ''
    const handles = raw
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean)
      .slice(0, 20)
    const cuts = await lookupReferralCuts(handles)
    res.json({ ok: true, cutPct: KOL_REFERRAL_CUT_PCT, cuts })
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'lookup failed' })
  }
})

kolRegisterRouter.get('/kols/claim/:username', async (req, res) => {
  try {
    const pitch = await getClaimPitch(String(req.params.username || ''))
    if (!pitch) {
      res.status(404).json({ ok: false, error: 'No CrewPay earnings found for this handle yet.' })
      return
    }
    res.json({ ok: true, ...pitch })
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'claim failed' })
  }
})

/** Operator: list pending @CrewPayHQ mention drafts (approval gate — never auto-posts). */
kolRegisterRouter.get('/kols/mentions/drafts', async (req, res) => {
  try {
    const key = (req.header('x-crew-api-key') || '').trim()
    const ops = (process.env.CREW_AGENT_API_KEY || '').trim()
    if (!ops || key !== ops) {
      res.status(401).json({ ok: false, error: 'Operator key required.' })
      return
    }
    const status = String(req.query.status || 'pending') as 'pending' | 'all'
    const drafts = await listMentionDrafts(status === 'all' ? 'all' : 'pending')
    res.json({ ok: true, drafts, note: 'Approve in dashboard/API, then post manually or via X tool — never auto-tweets.' })
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'list failed' })
  }
})

kolRegisterRouter.post('/kols/mentions/drafts/:id/:action', async (req, res) => {
  try {
    const key = (req.header('x-crew-api-key') || '').trim()
    const ops = (process.env.CREW_AGENT_API_KEY || '').trim()
    if (!ops || key !== ops) {
      res.status(401).json({ ok: false, error: 'Operator key required.' })
      return
    }
    const action = String(req.params.action || '')
    if (action !== 'approve' && action !== 'reject') {
      res.status(400).json({ ok: false, error: 'Use approve or reject.' })
      return
    }
    const draft = await setMentionDraftStatus(
      String(req.params.id || ''),
      action === 'approve' ? 'approved' : 'rejected',
    )
    if (!draft) {
      res.status(404).json({ ok: false, error: 'Draft not found.' })
      return
    }
    res.json({
      ok: true,
      draft,
      next:
        action === 'approve'
          ? 'Copy draftText and post from @CrewPayHQ (or wire X post tool). Mark posted with status=posted when done.'
          : 'Draft rejected.',
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'update failed' })
  }
})

kolRegisterRouter.get('/kols/registered/wallet/:wallet', async (req, res) => {
  try {
    const profile = await getKolProfileByWallet(String(req.params.wallet || ''))
    if (!profile) {
      res.status(404).json({ ok: false, error: 'No registration for this wallet.' })
      return
    }
    res.json({ ok: true, ...profile })
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'profile failed' })
  }
})

kolRegisterRouter.get('/kols/registered/:username', async (req, res) => {
  try {
    const profile = await getKolProfile(String(req.params.username || ''))
    if (!profile) {
      res.status(404).json({ ok: false, error: 'KOL is not registered.' })
      return
    }
    res.json({ ok: true, ...profile })
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'profile failed' })
  }
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
        referralCode: z.string().min(2).max(32).optional(),
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
      `${site}/kol/${encodeURIComponent(saved.xUsername)}?registered=1`,
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Registration failed'
    res.redirect(`${site}/register?error=${encodeURIComponent(msg.slice(0, 180))}`)
  }
})
