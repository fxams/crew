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
import { readPlatformBuybackWallet } from '../lib/agent/constants.js'
import { requireApiKeyOrWallet } from '../lib/wallet-auth.js'

const writeAuth = requireApiKeyOrWallet(requireApiKey)

export const coinsRouter = Router()

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

coinsRouter.put('/coins', writeAuth, async (req, res) => {
  try {
    const parsed = coinSchema.parse(req.body)
    const wallet = (req as typeof req & { crewWallet?: string }).crewWallet
    if (wallet && wallet !== parsed.launcher) {
      res.status(403).json({ error: 'Wallet signature must match coin launcher' })
      return
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
      remits: remits.map((r) => ({
        ...r,
        handle: enrichRemitHandle(r, coinMap.get(r.mint), buybackWallet),
      })),
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'list failed' })
  }
})

coinsRouter.post('/remits', writeAuth, async (req, res) => {
  try {
    const body = z.object({ remits: z.array(remitSchema).max(200) }).parse(req.body)
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
    res.json({ coins, remits })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'board failed' })
  }
})
