import { Router } from 'express'
import { z } from 'zod'
import { requireApiKey } from '../lib/auth.js'
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
    res.json({ coins })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'list failed' })
  }
})

coinsRouter.get('/coins/:mint', async (req, res) => {
  try {
    const coin = await getCoin(req.params.mint)
    if (!coin) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json({ coin })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'get failed' })
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
          throw new Error('pumpUrl must be on pump.fun, bags.fm, or zora.co')
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
    res.status(500).json({ error: err instanceof Error ? err.message : 'list failed' })
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
    res.status(500).json({ error: err instanceof Error ? err.message : 'board failed' })
  }
})
