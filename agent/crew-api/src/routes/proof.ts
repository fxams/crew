import { Router } from 'express'
import { buybackStats, listBuybackRuns, runCrewBuyback } from '../lib/buyback-exec.js'
import { requireApiKey } from '../lib/auth.js'
import { getProofBundle, recordModeAction } from '../lib/proof.js'
import { emitWebhookEvent } from '../lib/webhooks.js'
import { z } from 'zod'

export const proofRouter = Router()

proofRouter.get('/proof', async (req, res) => {
  try {
    const limit = Number(req.query.limit || 40)
    const bundle = await getProofBundle(limit)
    res.setHeader('Cache-Control', 'public, max-age=30')
    res.json(bundle)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'proof failed' })
  }
})

proofRouter.get('/buybacks', async (req, res) => {
  try {
    const limit = Number(req.query.limit || 40)
    const [runs, stats] = await Promise.all([listBuybackRuns(limit), buybackStats()])
    res.json({ ok: true, stats, runs })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'buybacks failed' })
  }
})

/** Manual buyback trigger (board key) — cron still runs hourly. */
proofRouter.post('/buybacks/run', requireApiKey, async (req, res) => {
  try {
    const dry = Boolean(req.body?.dryRun)
    const result = await runCrewBuyback({ forceDryRun: dry || undefined })
    if (result.status === 'ok') {
      void emitWebhookEvent('buyback.executed', {
        signature: result.signature,
        solSpent: result.solSpent,
        crewMint: result.crewMint,
        outAmount: result.outAmount,
      })
    }
    res.json({ ok: true, result })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'buyback run failed' })
  }
})

const modeActionSchema = z.object({
  id: z.string().min(4).max(64),
  mint: z.string().min(32).max(64),
  mode: z.enum(['split', 'buyback', 'raid', 'agent']),
  kind: z.enum(['dip_fire', 'raid_claim', 'desk_preview']),
  amountSol: z.number().positive().max(100),
  wallet: z.string().max(64).optional(),
  handle: z.string().max(32).optional(),
  signature: z.string().min(1).max(128),
  detail: z.string().max(500).optional(),
})

/** Record a real Dip fire / Raid claim from the desk (wallet-signed on client). */
proofRouter.post('/mode-actions', requireApiKey, async (req, res) => {
  try {
    const body = modeActionSchema.parse(req.body)
    await recordModeAction(body)
    res.status(201).json({ ok: true, action: body })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'mode action failed' })
  }
})
