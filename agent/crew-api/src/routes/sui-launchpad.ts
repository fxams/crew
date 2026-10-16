import { Router } from 'express'
import { z } from 'zod'
import { buildSuiLaunchpadUnsignedLaunch } from '../lib/agent/sui-launchpad.js'
import {
  fetchLaunchpadPool,
  fetchLaunchpadPools,
  fetchPoolTrades,
  launchpadEnabledForPublic,
  parseFeeRecipients,
  suiLaunchpadPublicConfig,
} from '../lib/agent/sui-launchpad-public.js'
import { buildLaunchpadTradeStep } from '../lib/agent/sui-launchpad-trade.js'
import { assertSuiAddress, isSuiAddress } from '../lib/agent/sui-address.js'
import type { Shareholder } from '../lib/agent/shareholders.js'

export const suiLaunchpadRouter = Router()

function jsonBigIntReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value
}

suiLaunchpadRouter.get('/sui/launchpad/config', (_req, res) => {
  res.json(suiLaunchpadPublicConfig())
})

suiLaunchpadRouter.get('/sui/launchpad/pools', async (_req, res) => {
  if (!launchpadEnabledForPublic()) {
    res.status(404).json({ ok: false, error: 'Sui launchpad is not enabled.' })
    return
  }
  try {
    const pools = await fetchLaunchpadPools(50)
    res.setHeader('Content-Type', 'application/json')
    res.send(JSON.stringify({ ok: true, pools }, jsonBigIntReplacer))
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) })
  }
})

suiLaunchpadRouter.get('/sui/launchpad/pools/:poolId', async (req, res) => {
  if (!launchpadEnabledForPublic()) {
    res.status(404).json({ ok: false, error: 'Sui launchpad is not enabled.' })
    return
  }
  const poolId = String(req.params.poolId || '')
  if (!isSuiAddress(poolId)) {
    res.status(400).json({ ok: false, error: 'Invalid pool id.' })
    return
  }
  try {
    const pool = await fetchLaunchpadPool(poolId)
    if (!pool) {
      res.status(404).json({ ok: false, error: 'Pool not found.' })
      return
    }
    const trades = await fetchPoolTrades(poolId, 30)
    const client = await import('../lib/agent/sui-coin-metadata.js')
    const gql = client.getSuiGraphqlClient()
    const { data } = await gql.query<{
      object?: { asMoveObject?: { contents?: { json?: Record<string, unknown> } } }
    }>({
      query: `query($id: SuiAddress!){ object(address:$id){ asMoveObject{ contents{ json }}}}`,
      variables: { id: poolId },
    })
    const recipients = parseFeeRecipients(data?.object?.asMoveObject?.contents?.json ?? {})
    res.setHeader('Content-Type', 'application/json')
    res.send(JSON.stringify({ ok: true, pool, trades, recipients }, jsonBigIntReplacer))
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) })
  }
})

const tradeBody = z.object({
  poolObjectId: z.string(),
  memeCoinType: z.string(),
  trader: z.string(),
  side: z.enum(['buy', 'sell']),
  amount: z.string(),
  slippageBps: z.number().int().min(0).max(10_000).optional().default(300),
  memeCoinObjectId: z.string().optional(),
})

suiLaunchpadRouter.post('/sui/launchpad/trade/unsigned', async (req, res) => {
  if (!launchpadEnabledForPublic()) {
    res.status(404).json({ ok: false, error: 'Sui launchpad is not enabled.' })
    return
  }
  const parsed = tradeBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.message })
    return
  }
  const cfg = suiLaunchpadPublicConfig()
  try {
    const step = await buildLaunchpadTradeStep({
      poolObjectId: parsed.data.poolObjectId,
      memeCoinType: parsed.data.memeCoinType,
      trader: parsed.data.trader,
      side: parsed.data.side,
      amount: BigInt(parsed.data.amount),
      slippageBps: parsed.data.slippageBps,
      tradeFeeBps: cfg.tradeFeeBps,
      memeCoinObjectId: parsed.data.memeCoinObjectId,
    })
    res.json({ ok: true, step })
  } catch (e) {
    res.status(400).json({ ok: false, error: e instanceof Error ? e.message : String(e) })
  }
})

const launchBody = z.object({
  name: z.string().min(1).max(64),
  ticker: z.string().min(1).max(16),
  launcherPubkey: z.string(),
  treasuryCapObjectId: z.string().optional(),
  publishedPackageId: z.string().optional(),
  crew: z
    .array(z.object({ wallet: z.string(), bps: z.number().int().positive() }))
    .optional(),
})

suiLaunchpadRouter.post('/sui/launchpad/launch/unsigned', async (req, res) => {
  if (!launchpadEnabledForPublic()) {
    res.status(404).json({ ok: false, error: 'Sui launchpad is not enabled.' })
    return
  }
  const parsed = launchBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.message })
    return
  }
  try {
    const treasury = assertSuiAddress(
      (process.env.SUI_TREASURY_ADDRESS || '').trim(),
      'treasury',
    )
    const launcher = assertSuiAddress(parsed.data.launcherPubkey, 'launcherPubkey')
    const defaultCrew = assertSuiAddress(
      (process.env.CREWPAY_DEFAULT_CREW_WALLET ||
        '0x2222222222222222222222222222222222222222222222222222222222222222').trim(),
      'crew',
    )
    let shareholders: Shareholder[]
    if (parsed.data.crew?.length) {
      shareholders = [
        ...parsed.data.crew.map((c) => ({
          wallet: assertSuiAddress(c.wallet, 'crew'),
          bps: c.bps,
          role: 'crew',
        })),
        { wallet: launcher, bps: 1500, role: 'desk' },
        { wallet: treasury, bps: 2500, role: 'platform' },
      ]
    } else {
      shareholders = [
        { wallet: defaultCrew, bps: 10_000, role: 'crew' },
        { wallet: launcher, bps: 1500, role: 'desk' },
        { wallet: treasury, bps: 2500, role: 'platform' },
      ]
    }
    const plan = await buildSuiLaunchpadUnsignedLaunch({
      name: parsed.data.name,
      ticker: parsed.data.ticker,
      launcherPubkey: parsed.data.launcherPubkey,
      shareholders,
      treasuryCapObjectId: parsed.data.treasuryCapObjectId,
      publishedPackageId: parsed.data.publishedPackageId,
    })
    res.json(plan)
  } catch (e) {
    res.status(400).json({ ok: false, error: e instanceof Error ? e.message : String(e) })
  }
})
