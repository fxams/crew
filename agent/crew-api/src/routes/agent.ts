import { Router } from 'express'
import { z } from 'zod'
import { requireApiKey } from '../lib/auth.js'
import { upsertCoin, type ApiCoin } from '../lib/coins.js'
import { MAX_CREW } from '../lib/agent/constants.js'
import { agentDiscoveryJson } from '../lib/agent/discovery.js'
import { planNarrativeHires } from '../lib/agent/narrative.js'
import { launchForAgent, type AgentLaunchInput } from '../lib/agent/launch.js'
import { parseLauncherKey } from '../lib/agent/send.js'

export const agentRouter = Router()

const crewMemberSchema = z.object({
  handle: z.string().min(1).max(32),
  wallet: z.string().min(32).max(64),
  share: z.number().int().min(1).max(100),
  hireRole: z.enum(['caller', 'chart', 'raid', 'kol', 'dev']).optional(),
})

const launchBodySchema = z
  .object({
    name: z.string().min(2).max(32),
    ticker: z.string().min(2).max(13),
    description: z.string().max(240).optional().default(''),
    mode: z.enum(['split', 'buyback', 'raid', 'agent']).optional().default('agent'),
    twitter: z.string().max(128).optional(),
    website: z.string().max(256).optional(),
    initialBuySol: z.number().min(0).max(100).optional().default(0),
    imageUrl: z.string().url().optional(),
    imageBase64: z.string().min(64).optional(),
    imageContentType: z.string().max(64).optional(),
    crew: z.array(crewMemberSchema).min(1).max(MAX_CREW).optional(),
    autoHire: z
      .object({
        seats: z.number().int().min(1).max(MAX_CREW).optional().default(5),
      })
      .optional(),
    agent: z
      .object({
        name: z.string().min(2).max(48),
        objective: z.string().min(8).max(280),
        model: z.string().max(48).optional(),
      })
      .optional(),
    holderKol: z.boolean().optional().default(false),
  })
  .superRefine((val, ctx) => {
    if (!val.imageUrl && !val.imageBase64) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide imageUrl or imageBase64',
        path: ['imageUrl'],
      })
    }
    if (!val.holderKol && !val.crew?.length && !val.autoHire) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide crew[] or autoHire (or holderKol: true)',
        path: ['autoHire'],
      })
    }
  })

const autohireBodySchema = z.object({
  name: z.string().max(32).optional().default(''),
  ticker: z.string().max(13).optional().default(''),
  description: z.string().max(240).optional().default(''),
  seats: z.number().int().min(1).max(MAX_CREW).optional().default(5),
})

agentRouter.get('/agent', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300')
  res.json(agentDiscoveryJson())
})

agentRouter.post('/agent/autohire', requireApiKey, async (req, res) => {
  try {
    const body = autohireBodySchema.parse(req.body)
    if (!body.name.trim() && !body.ticker.trim() && !body.description.trim()) {
      res.status(400).json({
        error: 'Provide name, ticker, or description for narrative matching.',
      })
      return
    }
    const plan = planNarrativeHires(
      { name: body.name, ticker: body.ticker, vibe: body.description },
      { limit: body.seats },
    )
    res.json({
      ok: true,
      seats: body.seats,
      match: plan.match,
      hires: plan.hires.map((h) => ({
        rank: h.hireRank,
        handle: `@${h.kol.x || h.kol.pump}`,
        pump: h.kol.pump,
        x: h.kol.x,
        wallet: h.kol.wallet,
        followers: h.kol.followers,
        dbRank: h.kol.rank,
        share: h.share,
        role: h.role,
        reasons: h.reasons,
        score: h.score,
      })),
      crew: plan.crew,
    })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'autohire failed' })
  }
})

function resolveLauncherKey(req: { header(name: string): string | undefined }): string {
  const fromHeader = (req.header('x-launcher-key') || '').trim()
  if (fromHeader) return fromHeader
  const fromEnv = process.env.CREW_AGENT_LAUNCHER_KEY?.trim()
  if (fromEnv) return fromEnv
  throw new Error(
    'Provide x-launcher-key (agent Solana secret) or set CREW_AGENT_LAUNCHER_KEY on the server.',
  )
}

agentRouter.post('/agent/launch', requireApiKey, async (req, res) => {
  try {
    const body = launchBodySchema.parse(req.body)
    const launcher = parseLauncherKey(resolveLauncherKey(req))

    const image = body.imageUrl
      ? ({ kind: 'url', url: body.imageUrl } as const)
      : ({
          kind: 'base64',
          data: body.imageBase64!,
          contentType: body.imageContentType,
        } as const)

    const input: AgentLaunchInput = {
      name: body.name,
      ticker: body.ticker,
      description: body.description,
      mode: body.mode,
      twitter: body.twitter,
      website: body.website,
      initialBuySol: body.initialBuySol,
      image,
      crew: body.crew,
      autoHire: body.holderKol ? undefined : body.autoHire || (body.crew ? undefined : { seats: 5 }),
      agent: body.agent,
      holderKol: body.holderKol,
    }

    const result = await launchForAgent(input, launcher)
    if (!result.ok) {
      res.status(400).json(result)
      return
    }

    // Persist to CREW board (best-effort).
    try {
      await upsertCoin({
        ...result.coin,
        feeShareSignature: result.feeShareSignature,
      } as ApiCoin)
    } catch (persistErr) {
      console.warn('agent launch persist failed', persistErr)
    }

    res.status(201).json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'launch failed'
    const status = /unauthorized|launcher key|api key/i.test(msg) ? 401 : 400
    res.status(status).json({ ok: false, error: msg })
  }
})
