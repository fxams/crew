import { Router } from 'express'
import { z } from 'zod'
import { takeRateLimit } from '../lib/agent/rate-limit.js'
import { clientIp } from '../lib/client-ip.js'
import { sendInternalError } from '../lib/http-error.js'
import {
  clearWalletConnectCookieHeader,
  issueConnectNonce,
  issueWalletConnectToken,
  readWalletConnectCookie,
  verifyConnectSignature,
  walletConnectCookieHeader,
} from '../lib/wallet-connect.js'

export const walletConnectRouter = Router()

const walletBody = z.object({
  wallet: z.string().min(32).max(64),
})

walletConnectRouter.post('/wallet/connect/nonce', async (req, res) => {
  try {
    const ip = clientIp(req)
    const gate = takeRateLimit(`wallet:connect:nonce:${ip}`, { limit: 30, windowMs: 60_000 })
    if (!gate.ok) {
      res.setHeader('Retry-After', String(gate.retryAfterSec))
      res.status(429).json({ ok: false, error: 'Slow down and retry.' })
      return
    }
    const { wallet } = walletBody.parse(req.body)
    const out = await issueConnectNonce(wallet)
    res.json({ ok: true, ...out, expiresAt: new Date(out.expiresAt).toISOString() })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'nonce failed'
    res.status(/Invalid/i.test(msg) ? 400 : 400).json({ ok: false, error: msg })
  }
})

walletConnectRouter.post('/wallet/connect/verify', async (req, res) => {
  try {
    const ip = clientIp(req)
    const gate = takeRateLimit(`wallet:connect:verify:${ip}`, { limit: 20, windowMs: 60_000 })
    if (!gate.ok) {
      res.setHeader('Retry-After', String(gate.retryAfterSec))
      res.status(429).json({ ok: false, error: 'Slow down and retry.' })
      return
    }
    const body = z
      .object({
        wallet: z.string().min(32).max(64),
        nonce: z.string().min(8).max(64),
        signature: z.string().min(64).max(128),
      })
      .parse(req.body)
    const verified = await verifyConnectSignature(body)
    const token = issueWalletConnectToken(verified.wallet)
    if (token) res.setHeader('Set-Cookie', walletConnectCookieHeader(token))
    res.json({
      ok: true,
      wallet: verified.wallet,
      expiresAt: new Date(verified.expiresAt).toISOString(),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'verify failed'
    const status = /signature|nonce expired/i.test(msg) ? 401 : 400
    res.status(status).json({ ok: false, error: msg })
  }
})

walletConnectRouter.get('/wallet/connect/me', (req, res) => {
  try {
    const session = readWalletConnectCookie(req.headers.cookie)
    if (!session) {
      res.status(401).json({ ok: false, error: 'Sign in with your wallet.' })
      return
    }
    res.json({
      ok: true,
      wallet: session.w,
      expiresAt: new Date(session.exp * 1000).toISOString(),
    })
  } catch (err) {
    sendInternalError(res, err, 'wallet-connect')
  }
})

walletConnectRouter.post('/wallet/connect/logout', (_req, res) => {
  res.setHeader('Set-Cookie', clearWalletConnectCookieHeader())
  res.json({ ok: true })
})
