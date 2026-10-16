import { Router, type Response } from 'express'
import { sendInternalError } from '../lib/http-error.js'
import { z } from 'zod'
import { requireApiKey } from '../lib/auth.js'
import { requireFeaturedOpsKey } from '../lib/featured-auth.js'
import {
  getCoin,
  listCoins,
  listRemits,
  upsertCoin,
  upsertRemits,
  type ApiCoin,
  type ApiRemit,
} from '../lib/coins.js'
import { enrichRemitHandle } from '../lib/proof.js'
import { isPlatformTreasury, readPlatformBuybackWallet } from '../lib/agent/constants.js'
import { requireApiKeyOrWallet, requireWalletSignatureOnly } from '../lib/wallet-auth.js'
import { issueBoardNonce } from '../lib/board-nonces.js'
import { assertSafeHttpUrl } from '../lib/agent/safe-url.js'
import {
  coinPageUrl,
  enrichPublicCoinMeta,
  publicCoinLinks,
  toPublicCoinPage,
  type PublicCoinMeta,
} from '../lib/coin-page.js'
import { avatarLogo, isLogoMint, logoCacheHeaders, resolveCoinLogo, type CachedLogo } from '../lib/coin-logo.js'
import { listLiveCoins } from '../lib/live-coins.js'
import { featuredPublic, listGraduatedUnfeatured, setCoinFeaturedX } from '../lib/featured.js'
import { detectGraduation, recordGraduationIfNew } from '../lib/graduation.js'
import { fetchPumpBondingCurveCreator } from '../lib/pump-creator.js'
import { assertRemitOnChain } from '../lib/remits-chain.js'

const writeAuth = requireApiKeyOrWallet(requireApiKey)
const walletOnly = requireWalletSignatureOnly()

export const coinsRouter = Router()

/** Single-use nonce for wallet-signed board writes (10-minute TTL, consumed on use). */
coinsRouter.post('/board/nonce', async (req, res) => {
  try {
    const wallet = (req.header('x-crew-wallet') || '').trim()
    if (!wallet) {
      res.status(400).json({ error: 'x-crew-wallet required' })
      return
    }
    const out = await issueBoardNonce(wallet)
    res.json({ ok: true, nonce: out.nonce, expiresAt: new Date(out.expiresAt).toISOString() })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'nonce failed' })
  }
})

const crewSchema = z.object({
  handle: z.string().min(1).max(32),
  wallet: z.string().min(32).max(64),
  share: z.number().int().min(0).max(100),
  hireRole: z.string().max(32).optional(),
})

const coinSchema = z.object({
  id: z.string().min(1).max(64),
  mint: z.string().min(32).max(64),
  name: z.string().min(1).max(64),
  ticker: z.string().min(1).max(16),
  vibe: z.string().max(500).optional().default(''),
  mode: z.enum(['split', 'buyback', 'raid', 'agent']),
  crew: z.array(crewSchema).max(10),
  signature: z.string().max(128).optional().default(''),
  feeShareSignature: z.string().max(128).optional(),
  launchedAt: z.number().int().positive(),
  launcher: z.string().max(64),
  pumpUrl: z.string().url().max(256),
  buybackRule: z.unknown().optional(),
  raidQuests: z.unknown().optional(),
  agent: z.unknown().optional(),
  holderKol: z.boolean().optional(),
  unlockedExpired: z.boolean().optional(),
  adminRevoked: z.boolean().optional(),
})

const remitSchema = z.object({
  id: z.string().min(1).max(128),
  mint: z.string().min(32).max(64),
  ticker: z.string().min(1).max(16),
  handle: z.string().min(1).max(32),
  wallet: z.string().max(64).optional().default(''),
  amountSol: z.number().positive(),
  mode: z.enum(['split', 'buyback', 'raid', 'agent']),
  at: z.number().int().positive(),
  signature: z.string().min(1).max(128),
  source: z.string().max(32).optional(),
})

coinsRouter.get('/coins', async (req, res) => {
  try {
    const limit = Number(req.query.limit || 100)
    const coins = await listCoins(limit)
    res.json({
      coins: coins.map((coin) => ({
        ...coin,
        ...publicCoinLinks(coin),
        pageUrl: coinPageUrl(coin.mint),
      })),
    })
  } catch (err) {
    sendInternalError(res, err, 'list coins')
  }
})

coinsRouter.get('/coins/graduated-unfeatured', requireFeaturedOpsKey, async (req, res) => {
  try {
    const limit = Number(req.query.limit || 50)
    const coins = await listGraduatedUnfeatured(limit)
    res.json({
      ok: true,
      coins: coins.map((c) => ({
        mint: c.mint,
        name: c.name,
        ticker: c.ticker,
        pageUrl: coinPageUrl(c.mint),
        pumpUrl: c.pumpUrl,
        graduatedAt: c.graduatedAt,
        graduatedVia: c.graduatedVia,
        featuredXUrl: null,
      })),
      note: 'Pump.fun graduates without a @CrewPayHQ post URL yet. External routine posts, then POST /api/coins/:mint/featured. CrewPay does not auto-post.',
    })
  } catch (err) {
    sendInternalError(res, err, 'graduated-unfeatured')
  }
})

coinsRouter.post('/coins/:mint/featured', requireFeaturedOpsKey, async (req, res) => {
  try {
    const mint = String(req.params.mint || '').trim()
    const url = String((req.body as { url?: string; featuredXUrl?: string })?.url
      || (req.body as { featuredXUrl?: string })?.featuredXUrl
      || '')
    const setBy = req.crewAgentAuth?.keyId || req.crewAgentAuth?.fingerprint || 'api-key'
    const coin = await setCoinFeaturedX({ mint, url, setBy })
    res.json({ ok: true, featured: featuredPublic(coin), autoPosted: false })
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'featured failed' })
  }
})

coinsRouter.get('/coins/live', async (req, res) => {
  try {
    const limit = Number(req.query.limit || 40)
    const coins = await listLiveCoins(limit)
    res.json({
      ok: true,
      coins,
      note: 'CrewPay launches only. Market cap and 24h change from Dexscreener /tokens/v1 (batched, cached ~90s) with Pump.fun bonding-curve fallback. Unknown fields are null — UI shows --.',
    })
  } catch (err) {
    sendInternalError(res, err, 'live coins')
  }
})

function sendCoinLogo(res: Response, logo: CachedLogo) {
  const headers = logoCacheHeaders(logo)
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v)
  res.status(200).end(logo.buf)
}

/** Cached ~96px logo. Tries pump.fun Pinata CDN → Pinata → nftstorage → ipfs.io; letter avatar on miss. */
coinsRouter.get('/coins/:mint/logo', async (req, res) => {
  const mint = String(req.params.mint || '').trim()
  try {
    if (!isLogoMint(mint)) {
      sendCoinLogo(res, avatarLogo('?'))
      return
    }
    let ticker = '?'
    let imageUrl: string | undefined
    try {
      const coin = await getCoin(mint)
      if (coin?.ticker) ticker = coin.ticker
      const meta = await enrichPublicCoinMeta({
        mint,
        pumpUrl: coin?.pumpUrl,
        platform: coin?.platform,
      }).catch(() => ({} as PublicCoinMeta))
      imageUrl = meta.imageUrl
    } catch {
      const meta = await enrichPublicCoinMeta({ mint }).catch(() => ({} as PublicCoinMeta))
      imageUrl = meta.imageUrl
    }
    const logo = await resolveCoinLogo({ mint, ticker, imageUrl })
    sendCoinLogo(res, logo)
  } catch (err) {
    console.error('coin logo', err)
    sendCoinLogo(res, avatarLogo('?'))
  }
})

coinsRouter.get('/coins/:mint', async (req, res) => {
  try {
    const coin = await getCoin(req.params.mint)
    if (!coin) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const meta = await enrichPublicCoinMeta(coin).catch(() => ({} as PublicCoinMeta))
    if (meta.graduated) {
      const rec = await recordGraduationIfNew(coin, {
        graduated: true,
        via: meta.graduatedVia || 'observed',
      }).catch(() => null)
      if (rec?.graduatedAt) {
        coin.graduatedAt = rec.graduatedAt
        coin.graduatedVia = rec.via || coin.graduatedVia
      }
    }
    res.json({ coin: toPublicCoinPage(coin, meta) })
  } catch (err) {
    sendInternalError(res, err, 'get coin')
  }
})

coinsRouter.put('/coins', walletOnly, async (req, res) => {
  try {
    const parsed = coinSchema.parse(req.body)
    const wallet = (req as typeof req & { crewWallet?: string }).crewWallet
    if (wallet && wallet !== parsed.launcher) {
      res.status(403).json({ error: 'Wallet signature must match coin launcher' })
      return
    }
    // Existing coin: signer must equal stored launcher; ignore any launcher change.
    const existing = await getCoin(parsed.mint)
    if (existing) {
      if (existing.launcher !== (wallet || '')) {
        res.status(403).json({ error: 'Only the launcher wallet may update this coin' })
        return
      }
      parsed.launcher = existing.launcher
    } else {
      // New coin: trade URL must be HTTPS on Pump.fun, Bags.fm, or Zora.
      let host = ''
      try {
        const { isAllowedTradeHost } = await import('../lib/agent/platforms.js')
        const u = assertSafeHttpUrl(parsed.pumpUrl, 'pumpUrl')
        host = u.hostname.toLowerCase()
        if (!isAllowedTradeHost(host)) {
          throw new Error('pumpUrl must be on pump.fun, bags.fm, zora.co, clanker.world, or vibevibe.fun')
        }
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid pumpUrl' })
        return
      }
      if (host === 'pump.fun' || host === 'www.pump.fun') {
        try {
          const creator = await fetchPumpBondingCurveCreator(parsed.mint)
          if (creator !== (wallet || '')) {
            res.status(403).json({ error: 'Wallet must be the Pump bonding-curve creator' })
            return
          }
        } catch (err) {
          res.status(400).json({
            error: err instanceof Error ? err.message : 'Could not verify Pump bonding-curve creator',
          })
          return
        }
      }
    }
    const coin = await upsertCoin(parsed as ApiCoin)
    res.json({ coin })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'upsert failed'
    res.status(400).json({ error: msg })
  }
})

coinsRouter.get('/remits', async (req, res) => {
  try {
    const mint =
      typeof req.query.mint === 'string' && req.query.mint.trim().length >= 32
        ? req.query.mint.trim()
        : undefined
    const remits = await listRemits(Number(req.query.limit || 200), { mint })
    const buybackWallet = readPlatformBuybackWallet() || null
    // Enrich handles the same way /api/proof does (crew / buyback / launcher labels).
    const coinsNeeded = [...new Set(remits.map((r) => r.mint))]
    const coinMap = new Map<string, ApiCoin>()
    await Promise.all(
      coinsNeeded.map(async (m) => {
        const c = await getCoin(m)
        if (c) coinMap.set(m, c)
      }),
    )
    res.json({
      remits: remits.map((r) => {
        const coin = coinMap.get(r.mint)
        let role = (r.role || '').toLowerCase() || null
        if (role === 'kol') role = 'crew'
        if (!role) {
          if (isPlatformTreasury(r.wallet)) role = 'platform'
          else if (coin?.crew.some((c) => c.wallet === r.wallet)) role = 'crew'
          else if (coin && coin.launcher === r.wallet) role = 'desk'
        }
        if (isPlatformTreasury(r.wallet)) role = 'platform'
        return {
          ...r,
          role: role ?? undefined,
          handle: enrichRemitHandle(r, coin, buybackWallet),
        }
      }),
    })
  } catch (err) {
    sendInternalError(res, err, 'list remits')
  }
})

coinsRouter.post('/remits', walletOnly, async (req, res) => {
  try {
    const body = z.object({ remits: z.array(remitSchema).max(200) }).parse(req.body)
    const wallet = (req as typeof req & { crewWallet?: string }).crewWallet || ''
    // Only allow remits for mints launched by this wallet.
    const mints = [...new Set(body.remits.map((r) => r.mint))]
    const coinsByMint = new Map<string, ApiCoin>()
    for (const m of mints) {
      const coin = await getCoin(m)
      if (!coin || coin.launcher !== wallet) {
        res.status(403).json({ error: 'Cannot submit remits for a mint you did not launch' })
        return
      }
      coinsByMint.set(m, coin)
    }
    for (const r of body.remits) {
      const coin = coinsByMint.get(r.mint)
      const platform = coin?.platform || 'pumpfun'
      if (platform === 'pumpfun' && r.wallet) {
        await assertRemitOnChain({
          mint: r.mint,
          wallet: r.wallet,
          signature: r.signature,
        })
      }
    }
    const saved = await upsertRemits(body.remits as ApiRemit[])
    res.json({ saved })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'upsert failed'
    res.status(400).json({ error: msg })
  }
})

coinsRouter.get('/board', async (_req, res) => {
  try {
    const [coins, remits] = await Promise.all([listCoins(100), listRemits(200)])
    const buybackWallet = readPlatformBuybackWallet() || null
    const coinsByMint = new Map(coins.map((c) => [c.mint, c]))
    res.json({
      coins,
      remits: remits.map((r) => {
        const coin = coinsByMint.get(r.mint)
        let role = (r.role || '').toLowerCase() || null
        if (role === 'kol') role = 'crew'
        if (!role) {
          if (isPlatformTreasury(r.wallet)) role = 'platform'
          else if (coin?.crew.some((c) => c.wallet === r.wallet)) role = 'crew'
          else if (coin && coin.launcher === r.wallet) role = 'desk'
        }
        if (isPlatformTreasury(r.wallet)) role = 'platform'
        return {
          ...r,
          role: role ?? undefined,
          handle: enrichRemitHandle(r, coin, buybackWallet),
        }
      }),
    })
  } catch (err) {
    sendInternalError(res, err, 'board')
  }
})
