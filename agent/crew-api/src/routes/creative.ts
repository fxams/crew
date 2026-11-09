import { Router } from 'express'
import { requireAgentApiKey } from '../lib/auth.js'
import { getCoin } from '../lib/coins.js'
import {
  creativeKitBlock,
  creativeMcpEnabled,
  creativePublicJson,
  generateCoinStill,
  getCreativeAsset,
  isCreativeStillKind,
  publicCreativeItem,
} from '../lib/creative-mcp.js'

export const creativeRouter = Router()

creativeRouter.get('/creative', async (_req, res) => {
  try {
    res.json(await creativePublicJson())
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'creative failed' })
  }
})

creativeRouter.get('/creative/assets/:id', (req, res) => {
  const asset = getCreativeAsset(String(req.params.id || '').trim())
  if (!asset) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  if (asset.urls[0]) {
    res.redirect(302, asset.urls[0])
    return
  }
  if (asset.imageBase64) {
    const buf = Buffer.from(asset.imageBase64, 'base64')
    res.setHeader('content-type', asset.mimeType || 'image/png')
    res.setHeader('cache-control', 'public, max-age=300')
    res.send(buf)
    return
  }
  res.status(404).json({ error: 'Not found' })
})

creativeRouter.get('/coins/:mint/creative', async (req, res) => {
  try {
    const mint = String(req.params.mint || '').trim()
    const coin = await getCoin(mint)
    if (!coin) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json({
      ok: true,
      mint: coin.mint,
      ...creativeKitBlock(coin.mint),
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'creative failed' })
  }
})

creativeRouter.post('/coins/:mint/creative', requireAgentApiKey, async (req, res) => {
  try {
    if (!creativeMcpEnabled()) {
      res.status(503).json({
        ok: false,
        error: 'Creative generate is off',
        fix: 'Set CREATIVE_MCP_ENABLED=1 and CREATIVE_MCP_API_KEY on crewpay-api. Agents can still connect to creative-mcp directly.',
        site: 'https://creative-mcp-40dj.onrender.com',
        page: 'https://crewpay.dev/creative',
      })
      return
    }
    const mint = String(req.params.mint || '').trim()
    const coin = await getCoin(mint)
    if (!coin) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const body = (req.body || {}) as { kind?: unknown; prompt?: unknown; style?: unknown }
    if (!isCreativeStillKind(body.kind)) {
      res.status(400).json({ error: 'kind must be logo, banner, or meme' })
      return
    }
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : undefined
    const style = typeof body.style === 'string' ? body.style.trim() : undefined
    const asset = await generateCoinStill({
      mint: coin.mint,
      ticker: coin.ticker,
      name: coin.name,
      kind: body.kind,
      prompt,
      style,
    })
    res.status(201).json({
      ok: true,
      item: publicCreativeItem(asset),
      note: 'Still from creative-mcp. Humans stay the core for escrow jobs. No earnings promises.',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'generate failed'
    const status = /daily cap/i.test(message) ? 429 : /off/i.test(message) ? 503 : 502
    res.status(status).json({ ok: false, error: message })
  }
})
