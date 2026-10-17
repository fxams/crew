import { Router } from 'express'
import { z } from 'zod'
import { randomBytes } from 'node:crypto'
import { takeRateLimit } from '../lib/agent/rate-limit.js'
import { AGENT_REFERRAL_BPS } from '../lib/agent/constants.js'
import { getKolReferralStats } from '../lib/agent-referral.js'
import {
  beginXAuth,
  completeXCallback,
  getRegistrationProgress,
  getClaimPitch,
  getKolProfile,
  getKolProfileByWallet,
  getKolProfileByXUserId,
  issueNonce,
  updateKolEvmWallet,
  updateKolPayoutWallet,
  KOL_REFERRAL_CUT_PCT,
  listRegistered,
  REFERRAL_POINTS_HIRE,
  REFERRAL_POINTS_MIN_FOLLOWERS,
  REFERRAL_POINTS_REGISTER,
  REFERRAL_POINTS_REGISTER_DAILY_CAP,
  siteUrl,
  xOAuthConfigured,
} from '../lib/kol-register.js'
import { xOauthErrorFlag } from '../lib/kol-oauth-state.js'
import { issueKolSessionToken, kolSessionCookieHeader, readKolSessionCookie } from '../lib/kol-session.js'
import { privyAppIdFromEnv, verifyPrivyPayoutWallet } from '../lib/privy.js'
import {
  TELEGRAM_BOT_URL,
  TELEGRAM_BOT_USERNAME,
  telegramBotId,
  telegramConfigured,
} from '../lib/telegram.js'
import {
  listMentionDrafts,
  setMentionDraftStatus,
} from '../lib/kol-mentions.js'
import { kolEvmWalletFresh, kolReferralsWalletFresh } from '../lib/wallet-auth.js'
import { clientIp } from '../lib/client-ip.js'
import { sendInternalError } from '../lib/http-error.js'
import { kolProgramEnabled } from '../lib/kol-program/flags.js'
import { REACH_FORMULA_DOC } from '../lib/kol-program/reach-score.js'

export const kolRegisterRouter = Router()

const solanaAddress = z.string().min(32).max(64)

kolRegisterRouter.get('/kols/register/status', (_req, res) => {
  const privyAppId = privyAppIdFromEnv()
  res.json({
    xOauth: xOAuthConfigured(),
    redirectUri: process.env.X_REDIRECT_URI?.trim() || 'https://api.crewpay.dev/api/kols/register/callback',
    requires: ['x oauth'],
    walletOptional: true,
    noCryptoNeeded: 'No crypto needed. Just an X account — or Telegram.',
    telegram: {
      enabled: telegramConfigured(),
      botUsername: TELEGRAM_BOT_USERNAME,
      botUrl: TELEGRAM_BOT_URL,
      botId: telegramBotId() || undefined,
      login: telegramConfigured(),
    },
    privy: {
      enabled: Boolean(privyAppId),
      appId: privyAppId || undefined,
      env: ['PRIVY_APP_ID', 'VITE_PRIVY_APP_ID', 'PRIVY_APP_SECRET'],
    },
    referral: {
      cutPct: KOL_REFERRAL_CUT_PCT,
      cutBps: AGENT_REFERRAL_BPS,
      linkPattern: `${siteUrl()}/r/<code>`,
      note:
        'Every registered KOL gets a referral code + link (crewpay.dev/r/<code>). Agents that claim a key with your code permanently bind you as referrer — referred launches split fees 60% to the KOL crew / 15% to the launching agent / 5% you / 20% to the treasury (non-referred stay 60% to the KOL crew, 15% to the launching agent, 25% to the treasury). The launching agent does not receive the 60% crew slice. Buyback cron is NOT live.',
    evmWallet:
      'Optional Base (0x) address. Needed to be paid on Zora / Base launches. Solana payout wallet is optional at signup — add a wallet to get hired and paid. KOLs without a wallet are skipped for crews.',
      points: {
        register: REFERRAL_POINTS_REGISTER,
        hire: REFERRAL_POINTS_HIRE,
        minFollowers: REFERRAL_POINTS_MIN_FOLLOWERS,
        registerDailyCap: REFERRAL_POINTS_REGISTER_DAILY_CAP,
        note: 'Points accrue for a future CREW token airdrop. Direct referrals only. Register awards require min followers and a per-referrer daily cap.',
      },
    },
    kolProgram: kolProgramEnabled()
      ? {
          enabled: true,
          linkPattern: `${siteUrl()}/ref/<handle>`,
          reachFormula: REACH_FORMULA_DOC,
          pointsDisclaimer:
            'Program points have no monetary value. No token, airdrop, or cash redemption.',
        }
      : { enabled: false },
  })
})

/**
 * KOL-authed referral dashboard: referred agents, launches, fees earned.
 * Auth: sign `crew-kol-referrals:<wallet>:<timestamp>` (Phantom) →
 * headers x-crew-wallet, x-crew-timestamp, x-crew-signature.
 */
kolRegisterRouter.get('/kol/referrals', async (req, res) => {
  try {
    const ip = clientIp(req)
    const gate = takeRateLimit(`kol:referrals:${ip}`, { limit: 30, windowMs: 60_000 })
    if (!gate.ok) {
      res.setHeader('Retry-After', String(gate.retryAfterSec))
      res.status(429).json({ ok: false, error: 'Slow down and retry.' })
      return
    }
    const signed = kolReferralsWalletFresh(req)
    if (!signed) {
      res.status(401).json({
        ok: false,
        error:
          'KOL wallet signature required. Sign message crew-kol-referrals:<wallet>:<timestamp> and send x-crew-wallet, x-crew-timestamp, x-crew-signature.',
      })
      return
    }
    const stats = await getKolReferralStats(signed.wallet)
    if (!stats) {
      res.status(404).json({
        ok: false,
        error: 'Wallet is not a registered KOL — complete /register first.',
      })
      return
    }
    res.json({ ok: true, ...stats })
  } catch (err) {
    sendInternalError(res, err, 'kol referrals')
  }
})

/**
 * Legacy endpoint: KOL-seat carve-out was removed.
 * Kept for older clients — always returns empty cuts.
 * Agent-key referral earnings: GET /api/kol/referrals.
 */
/**
 * Owner-signed optional Base / EVM payout address (Zora launches).
 * Auth: sign `crew-kol-evm:<wallet>:<evmWallet>:<timestamp>` (empty evmWallet clears).
 */
kolRegisterRouter.post('/kols/register/evm', async (req, res) => {
  try {
    const ip = clientIp(req)
    const gate = takeRateLimit(`kolreg:evm:${ip}`, { limit: 20, windowMs: 60_000 })
    if (!gate.ok) {
      res.setHeader('Retry-After', String(gate.retryAfterSec))
      res.status(429).json({ ok: false, error: 'Slow down and retry.' })
      return
    }
    const signed = kolEvmWalletFresh(req)
    if (!signed) {
      res.status(401).json({
        ok: false,
        error:
          'KOL wallet signature required. Sign message crew-kol-evm:<wallet>:<evmWallet>:<timestamp> and send x-crew-wallet, x-crew-timestamp, x-crew-signature.',
      })
      return
    }
    const profile = await updateKolEvmWallet(signed.wallet, signed.evmWallet || null)
    res.json({
      ok: true,
      ...profile,
      tip: 'Needed to be paid on Zora / Base launches. Pump.fun and Bags.fm still use your Solana wallet.',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'evm wallet update failed'
    const status = /not a registered/i.test(msg) ? 404 : 400
    res.status(status).json({ ok: false, error: msg })
  }
})

kolRegisterRouter.get('/kols/referral-cuts', async (req, res) => {
  try {
    const ip = clientIp(req)
    const gate = takeRateLimit(`kolreg:refcuts:${ip}`, { limit: 30, windowMs: 60_000 })
    if (!gate.ok) {
      res.setHeader('Retry-After', String(gate.retryAfterSec))
      res.status(429).json({ ok: false, error: 'Slow down and retry.' })
      return
    }
    void req.query.handles
    res.json({
      ok: true,
      cutPct: 0,
      cuts: [],
      retired: true,
      note:
        'KOL-seat referral carve removed. Referral means 5% of creator fees on agent-key referred launches — see GET /api/kol/referrals.',
    })
  } catch (err) {
    sendInternalError(res, err, 'kol-register')
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
    sendInternalError(res, err, 'kol-register')
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
    sendInternalError(res, err, 'kol-register')
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
    sendInternalError(res, err, 'kol-register')
  }
})

kolRegisterRouter.get('/kols/me', async (req, res) => {
  try {
    const session = readKolSessionCookie(req.headers.cookie)
    if (!session) {
      res.status(401).json({ ok: false, error: 'Sign in with X to manage this desk.' })
      return
    }
    const profile = await getKolProfileByXUserId(session.u)
    if (!profile) {
      res.status(404).json({ ok: false, error: 'KOL is not registered.' })
      return
    }
    res.json({ ok: true, ...profile, session: { handle: session.h } })
  } catch (err) {
    sendInternalError(res, err, 'kol-register')
  }
})

kolRegisterRouter.post('/kols/register/wallet', async (req, res) => {
  try {
    const ip = clientIp(req)
    const gate = takeRateLimit(`kolreg:wallet:${ip}`, { limit: 20, windowMs: 60_000 })
    if (!gate.ok) {
      res.setHeader('Retry-After', String(gate.retryAfterSec))
      res.status(429).json({ ok: false, error: 'Slow down and retry.' })
      return
    }
    const session = readKolSessionCookie(req.headers.cookie)
    const body = z
      .object({
        wallet: solanaAddress,
        message: z.string().min(10).max(400).optional(),
        signature: z.string().min(64).max(128),
        timestamp: z.number().optional(),
        changeSignature: z.string().min(64).max(128).optional(),
        changeTimestamp: z.number().optional(),
        privyToken: z.string().min(20).max(8000).optional(),
      })
      .parse(req.body)
    if (body.privyToken) {
      await verifyPrivyPayoutWallet({ token: body.privyToken, address: body.wallet })
    }
    let handle = session?.h || ''
    if (!handle) {
      const fromWallet = kolReferralsWalletFresh(req)
      if (fromWallet) {
        const existing = await getKolProfileByWallet(fromWallet.wallet)
        handle = existing?.profile.xUsername || ''
      }
    }
    if (!handle) {
      res.status(401).json({
        ok: false,
        error:
          'Sign in with X or connect the linked Solana wallet to add a payout address.',
      })
      return
    }
    const ts =
      Number(req.header('x-crew-timestamp') || '') ||
      Number(body.timestamp) ||
      Date.now()
    const profile = await updateKolPayoutWallet({
      xUsername: handle,
      newWallet: body.wallet,
      newWalletSignature: body.signature,
      newWalletTimestamp: ts,
      changeSignature: body.changeSignature,
      changeTimestamp: body.changeTimestamp,
    })
    res.json({
      ok: true,
      ...profile,
      tip: 'Payouts go to this Solana address. CrewPay never holds keys — Privy embedded wallets are non-custodial.',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'wallet update failed'
    const status = /not a registered/i.test(msg) ? 404 : /Sign /i.test(msg) ? 401 : 400
    res.status(status).json({ ok: false, error: msg })
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
    sendInternalError(res, err, 'kol-register')
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
    sendInternalError(res, err, 'kol-register')
  }
})

kolRegisterRouter.get('/kols/registered', async (req, res) => {
  try {
    const ip = clientIp(req)
    const gate = takeRateLimit(`kolreg:list:${ip}`, { limit: 60, windowMs: 60_000 })
    if (!gate.ok) {
      res.setHeader('Retry-After', String(gate.retryAfterSec))
      res.status(429).json({ ok: false, error: 'Slow down and retry.' })
      return
    }
    const limit = Number(req.query.limit || 50)
    const board = await listRegistered(limit)
    res.json({ ok: true, ...board })
  } catch (err) {
    sendInternalError(res, err, 'kol-register')
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
        wallet: solanaAddress.optional(),
        message: z.string().min(20).max(400).optional(),
        signature: z.string().min(64).max(128).optional(),
        referralCode: z.string().min(2).max(32).optional(),
        evmWallet: z.string().max(42).optional(),
        registerSrc: z.string().min(2).max(32).optional(),
      })
      .refine(
        (data) => {
          const has = Boolean(data.wallet)
          return has === Boolean(data.message) && has === Boolean(data.signature)
        },
        { message: 'Wallet, message, and signature must be sent together — or omit all three to register with X only.' },
      )
      .parse(req.body)
    // Optional CSRF cookie — primary proof is the signed OAuth `state` param.
    const cookieVal = randomBytes(16).toString('hex')
    res.setHeader(
      'Set-Cookie',
      `crew_reg=${cookieVal}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${10 * 60}`,
    )
    const out = await beginXAuth({
      ...body,
      ip,
      regCookie: cookieVal,
      evmWallet: body.evmWallet,
      registerSrc: body.registerSrc,
    })
    res.json({
      ok: true,
      authorizeUrl: out.authorizeUrl,
      expiresAt: out.expiresAt,
      wallet: out.wallet,
      sid: out.sid,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'start failed'
    const status = /not configured/i.test(msg) ? 503 : 400
    res.status(status).json({ ok: false, error: msg })
  }
})

function registerErrorRedirect(site: string, msg: string): string {
  const q = new URLSearchParams({ error: msg.slice(0, 180) })
  const flag = xOauthErrorFlag(msg)
  if (flag) q.set('xoauth', flag)
  return `${site}/register?${q.toString()}`
}

kolRegisterRouter.get('/kols/register/progress', async (req, res) => {
  try {
    const ip = clientIp(req)
    const gate = takeRateLimit(`kolreg:progress:${ip}`, { limit: 40, windowMs: 60_000 })
    if (!gate.ok) {
      res.setHeader('Retry-After', String(gate.retryAfterSec))
      res.status(429).json({ ok: false, error: 'Slow down and retry.' })
      return
    }
    const sid = typeof req.query.sid === 'string' ? req.query.sid : ''
    const out = await getRegistrationProgress(sid)
    res.json({ ok: true, ...out })
  } catch (err) {
    sendInternalError(res, err, 'kol-register-progress')
  }
})

kolRegisterRouter.get('/kols/register/callback', async (req, res) => {
  const site = siteUrl()
  const code = typeof req.query.code === 'string' ? req.query.code : ''
  const state = typeof req.query.state === 'string' ? req.query.state : ''
  const oauthError = typeof req.query.error === 'string' ? req.query.error : ''
  if (oauthError) {
    res.redirect(registerErrorRedirect(site, oauthError))
    return
  }
  if (!code || !state) {
    res.redirect(registerErrorRedirect(site, 'Missing X authorization code'))
    return
  }
  try {
    const cookieHeader = String(req.headers.cookie || '')
    const match = cookieHeader.match(/(?:^|;)\s*crew_reg=([^;]+)/)
    const cookieVal = match ? decodeURIComponent(match[1]!) : ''
    const saved = await completeXCallback(code, state, { regCookie: cookieVal })
    if (saved.xUserId) {
      try {
        const token = issueKolSessionToken({ xUserId: saved.xUserId, username: saved.xUsername })
        res.setHeader('Set-Cookie', kolSessionCookieHeader(token))
      } catch {
        /* session is optional — desk still loads from the redirect */
      }
    }
    // `from=x` tells the desk to show "return to the wallet and tap Check" when
    // X opened in Safari / the X app instead of the wallet in-app browser.
    res.redirect(
      `${site}/kol/${encodeURIComponent(saved.xUsername)}?registered=1&from=x`,
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Registration failed'
    res.redirect(registerErrorRedirect(site, msg))
  }
})
