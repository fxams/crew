import { Router } from 'express'
import { z } from 'zod'
import { apiKeyFingerprint, clientIp, requireAgentApiKey } from '../lib/auth.js'
import { createAgentKey, listAgentKeys, revokeAgentKey } from '../lib/agent-keys.js'
import { upsertCoin, type ApiCoin } from '../lib/coins.js'
import { MAX_CREW, MAX_INITIAL_BUY_SOL } from '../lib/agent/constants.js'
import { agentDiscoveryJson } from '../lib/agent/discovery.js'
import {
  getIdempotent,
  normalizeIdempotencyKey,
  setIdempotent,
} from '../lib/agent/idempotency.js'
import { planNarrativeHires } from '../lib/agent/narrative.js'
import { launchForAgent, type AgentLaunchInput } from '../lib/agent/launch.js'
import { takeRateLimit } from '../lib/agent/rate-limit.js'
import {
  crankRemitsForAgent,
  deskModeOrDefault,
  getAgentMintStatus,
  lockHolderKolForAgent,
  wireFeesForAgent,
} from '../lib/agent/repair.js'
import { assertSafeHttpUrl } from '../lib/agent/safe-url.js'
import { parseLauncherKey } from '../lib/agent/send.js'
import { emitWebhookEvent } from '../lib/webhooks.js'

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
    ticker: z
      .string()
      .min(2)
      .max(13)
      .regex(/^\$?[A-Za-z0-9]{2,13}$/, 'Ticker must be 2–13 letters/numbers'),
    description: z.string().max(240).optional().default(''),
    mode: z.enum(['split', 'buyback', 'raid', 'agent']).optional().default('agent'),
    twitter: z.string().max(128).optional(),
    website: z.string().max(256).optional(),
    initialBuySol: z.number().min(0).max(MAX_INITIAL_BUY_SOL).optional().default(0),
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
    if (val.imageUrl) {
      try {
        assertSafeHttpUrl(val.imageUrl, 'imageUrl')
      } catch (err) {
        ctx.addIssue({
          code: 'custom',
          message: err instanceof Error ? err.message : 'Invalid imageUrl',
          path: ['imageUrl'],
        })
      }
    }
    if (val.website) {
      try {
        assertSafeHttpUrl(val.website, 'website')
      } catch (err) {
        ctx.addIssue({
          code: 'custom',
          message: err instanceof Error ? err.message : 'Invalid website',
          path: ['website'],
        })
      }
    }
  })

const autohireBodySchema = z.object({
  name: z.string().max(32).optional().default(''),
  ticker: z.string().max(13).optional().default(''),
  description: z.string().max(240).optional().default(''),
  seats: z.number().int().min(1).max(MAX_CREW).optional().default(5),
})

function applyRateLimit(
  res: import('express').Response,
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const result = takeRateLimit(key, { limit, windowMs })
  res.setHeader('X-RateLimit-Limit', String(limit))
  res.setHeader('X-RateLimit-Remaining', String(result.remaining))
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)))
  if (!result.ok) {
    res.setHeader('Retry-After', String(result.retryAfterSec))
    res.status(429).json({
      ok: false,
      error: 'Rate limit exceeded — slow down and retry.',
      retryAfterSec: result.retryAfterSec,
    })
    return false
  }
  return true
}

agentRouter.get('/agent', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300')
  res.json(agentDiscoveryJson())
})

agentRouter.post('/agent/autohire', requireAgentApiKey, async (req, res) => {
  try {
    const fp = apiKeyFingerprint(req)
    const ip = clientIp(req)
    if (!applyRateLimit(res, `autohire:key:${fp}`, 30, 60_000)) return
    if (!applyRateLimit(res, `autohire:ip:${ip}`, 60, 60_000)) return

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
      tip: 'Inspect hires/reasons, optionally remix via crew[] on launch, or keep autoHire.',
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

agentRouter.post('/agent/launch', requireAgentApiKey, async (req, res) => {
  try {
    const fp = apiKeyFingerprint(req)
    const ip = clientIp(req)
    const launchLimit = req.crewAgentAuth?.launchesPerHour ?? 5
    if (!applyRateLimit(res, `launch:key:${fp}`, launchLimit, 60_000)) return
    if (!applyRateLimit(res, `launch:ip:${ip}`, 10, 60_000)) return

    let idem: string | null = null
    try {
      idem = normalizeIdempotencyKey(req.header('x-idempotency-key') || undefined)
    } catch (err) {
      res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'bad idempotency key' })
      return
    }
    if (idem) {
      const cached = getIdempotent(`launch:${fp}:${idem}`)
      if (cached) {
        res.setHeader('X-Idempotency-Replayed', '1')
        res.status(cached.status).json(cached.body)
        return
      }
    }

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
      const msg = persistErr instanceof Error ? persistErr.message : 'persist failed'
      console.warn('agent launch persist failed', msg)
    }

    void emitWebhookEvent('launch.created', {
      mint: result.mint,
      ticker: result.coin.ticker,
      feeShareLocked: result.feeShareLocked,
      pumpUrl: result.pumpUrl,
      mode: result.mode,
    })
    if (result.feeShareLocked) {
      void emitWebhookEvent('feeShare.locked', {
        mint: result.mint,
        feeShareSignature: result.feeShareSignature,
      })
    }

    // 201 = fully locked; 202 = mint live but fee-share incomplete (agents must check feeShareLocked).
    const status = result.feeShareLocked ? 201 : 202
    if (idem) setIdempotent(`launch:${fp}:${idem}`, status, result)
    res.status(status).json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'launch failed'
    // Never include header material; Zod issues are safe.
    const status = /unauthorized|launcher key|api key/i.test(msg) ? 401 : 400
    res.status(status).json({ ok: false, error: msg })
  }
})

agentRouter.get('/agent/status/:mint', requireAgentApiKey, async (req, res) => {
  try {
    const fp = apiKeyFingerprint(req)
    if (!applyRateLimit(res, `status:key:${fp}`, 60, 60_000)) return
    const mintParam = String(req.params.mint || '')
    const status = await getAgentMintStatus(mintParam)
    res.json(status)
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'status failed' })
  }
})

const wireBodySchema = z.object({
  mint: z.string().min(32).max(64),
  mode: z.enum(['split', 'buyback', 'raid', 'agent']).optional().default('agent'),
  name: z.string().max(64).optional(),
  ticker: z.string().max(16).optional(),
  crew: z.array(crewMemberSchema).min(1).max(MAX_CREW),
})

agentRouter.post('/agent/wire-fees', requireAgentApiKey, async (req, res) => {
  try {
    const fp = apiKeyFingerprint(req)
    if (!applyRateLimit(res, `wire:key:${fp}`, 10, 60_000)) return
    const body = wireBodySchema.parse(req.body)
    const launcher = parseLauncherKey(resolveLauncherKey(req))
    const result = await wireFeesForAgent({
      mint: body.mint,
      mode: body.mode,
      crew: body.crew,
      launcher,
      name: body.name,
      ticker: body.ticker,
    })
    void emitWebhookEvent('feeShare.locked', {
      mint: result.mint,
      feeShareSignature: result.feeShareSignature,
    })
    res.status(201).json(result)
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'wire-fees failed' })
  }
})

const lockHolderSchema = z.object({
  mint: z.string().min(32).max(64),
  mode: z.enum(['split', 'buyback', 'raid', 'agent']).optional().default('agent'),
  name: z.string().max(64).optional(),
  ticker: z.string().max(16).optional(),
})

agentRouter.post('/agent/lock-holder-kol', requireAgentApiKey, async (req, res) => {
  try {
    const fp = apiKeyFingerprint(req)
    if (!applyRateLimit(res, `holder:key:${fp}`, 10, 60_000)) return
    const body = lockHolderSchema.parse(req.body)
    const launcher = parseLauncherKey(resolveLauncherKey(req))
    const result = await lockHolderKolForAgent({
      mint: body.mint,
      mode: deskModeOrDefault(body.mode),
      launcher,
      name: body.name,
      ticker: body.ticker,
    })
    void emitWebhookEvent('holderKol.locked', {
      mint: result.mint,
      feeShareSignature: result.feeShareSignature,
      matches: result.proposal.matches.length,
    })
    void emitWebhookEvent('feeShare.locked', {
      mint: result.mint,
      feeShareSignature: result.feeShareSignature,
    })
    res.status(201).json(result)
  } catch (err) {
    res
      .status(400)
      .json({ ok: false, error: err instanceof Error ? err.message : 'lock-holder-kol failed' })
  }
})

agentRouter.post('/agent/crank', requireAgentApiKey, async (req, res) => {
  try {
    const fp = apiKeyFingerprint(req)
    if (!applyRateLimit(res, `crank:key:${fp}`, 20, 60_000)) return
    const mint = z.object({ mint: z.string().min(32).max(64) }).parse(req.body).mint
    const launcher = parseLauncherKey(resolveLauncherKey(req))
    const result = await crankRemitsForAgent({ mint, launcher })
    void emitWebhookEvent('remit.cranked', {
      mint: result.mint,
      signature: result.signature,
    })
    res.json(result)
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'crank failed' })
  }
})

agentRouter.get('/agent/keys', requireAgentApiKey, async (_req, res) => {
  try {
    const keys = await listAgentKeys()
    res.json({ ok: true, keys })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'list keys failed' })
  }
})

agentRouter.post('/agent/keys', requireAgentApiKey, async (req, res) => {
  try {
    const body = z
      .object({
        label: z.string().min(2).max(64),
        launchesPerHour: z.number().int().min(1).max(100).optional(),
      })
      .parse(req.body)
    const created = await createAgentKey(body)
    res.status(201).json({
      ok: true,
      key: created.key,
      row: created.row,
      tip: 'Store the key once — it is not shown again.',
    })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'create key failed' })
  }
})

agentRouter.delete('/agent/keys/:id', requireAgentApiKey, async (req, res) => {
  try {
    const ok = await revokeAgentKey(String(req.params.id || ''))
    if (!ok) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'revoke failed' })
  }
})
