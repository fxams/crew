import { Router } from 'express'
import { matchAdminToken, readAdminSecrets } from '../lib/farcaster-admin-auth.js'
import {
  authorizeFarcasterAdmin,
  getFarcasterConnection,
  issueFarcasterNonce,
  lookupFarcasterUsername,
  parseConnectBody,
  publicFarcasterStatus,
  saveFarcasterConnection,
} from '../lib/farcaster-signer.js'

export const farcasterRouter = Router()

farcasterRouter.get('/admin/farcaster', async (req, res) => {
  const auth = await authorizeFarcasterAdmin(req, { consumeNonce: false })
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error })
    return
  }
  const row = await getFarcasterConnection()
  res.json({ ok: true, ...publicFarcasterStatus(row) })
})

farcasterRouter.post('/admin/farcaster', async (req, res) => {
  const auth = await authorizeFarcasterAdmin(req, { consumeNonce: true })
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error })
    return
  }
  try {
    const parsed = parseConnectBody(req.body)
    const username = (await lookupFarcasterUsername(parsed.fid)) || parsed.username
    const row = await saveFarcasterConnection({ ...parsed, username })
    const publicStatus = publicFarcasterStatus(row)
    res.json({ ok: true, ...publicStatus })
  } catch (err) {
    res.status(400).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Invalid signer',
    })
  }
})

farcasterRouter.post('/admin/farcaster/nonce', async (req, res) => {
  const { token } = readAdminSecrets(req)
  if (!matchAdminToken(token)) {
    res.status(401).json({ ok: false, error: 'Unauthorized' })
    return
  }
  const out = await issueFarcasterNonce()
  res.json({ ok: true, ...out })
})
