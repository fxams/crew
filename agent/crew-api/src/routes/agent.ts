import { Router } from 'express'
import { z } from 'zod'
import { apiKeyFingerprint, clientIp, requireAgentApiKey } from '../lib/auth.js'
import { createAgentKey, listAgentKeys, revokeAgentKey } from '../lib/agent-keys.js'
import { listCoinsByAgentKey, listCoins, upsertCoin, type ApiCoin } from '../lib/coins.js'
import { MAX_CREW, MAX_INITIAL_BUY_SOL, USER_DESCRIPTION_MAX } from '../lib/agent/constants.js'
import { agentDiscoveryJson } from '../lib/agent/discovery.js'
import {
  getIdempotent,
  normalizeIdempotencyKey,
  setIdempotent,
} from '../lib/agent/idempotency.js'
import { planNarrativeHires } from '../lib/agent/narrative.js'
import { awardReferralHirePointsForCrew } from '../lib/kol-register.js'
import { listRegisteredHireBoosts } from '../lib/registered-hires.js'
import {
  dryRunLaunchForAgent,
  launchForAgent,
  launchNextSteps,
  type AgentLaunchInput,
} from '../lib/agent/launch.js'
import { takeRateLimit } from '../lib/agent/rate-limit.js'
import {
  crankRemitsForAgent,
  deskModeOrDefault,
  getAgentMintStatus,
  lockHolderKolForAgent,
  wireFeesForAgent,
} from '../lib/agent/repair.js'
import { assertSafeHttpUrl } from '../lib/agent/safe-url.js'
import { parseLauncherKey, resolveOpsPayer } from '../lib/agent/send.js'
import { solanaAddress } from '../lib/agent/solana-address.js'
import { draftMentionFromRemit } from '../lib/kol-mentions.js'
import { emitWebhookEvent } from '../lib/webhooks.js'

export const agentRouter = Router()

const AUTOHIRE_DISCLAIMER =
  'Autohire matches public Pump.fun profiles by narrative. Wallets are not opt-in partners, endorsed affiliates, or employees of CREW. Operators choose who receives fee-shares.'

const crewMemberSchema = z.object({
  handle: z.string().min(1).max(32),
  wallet: solanaAddress,
  share: z.number().int().min(1).max(100),
  hireRole: z.enum(['caller', 'chart', 'raid', 'kol', 'dev']).optional(),
})

function refineLaunchBody(
  val: {
    imageUrl?: string
    imageBase64?: string
    website?: string
    holderKol?: boolean
    crew?: { share: number }[]
    autoHire?: unknown
  },
  ctx: z.RefinementCtx,
) {
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
  if (val.crew?.length) {
    const shareSum = val.crew.reduce((s, m) => s + Math.round(Number(m.share) || 0), 0)
    if (shareSum !== 100) {
      ctx.addIssue({
        code: 'custom',
        message: `Crew shares must total 100% (now ${shareSum}%). Shares are relative to the hired-KOL pool, not including the 25% platform buyback.`,
        path: ['crew'],
      })
    }
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
}

const launchBodySchema = z
  .object({
    name: z.string().min(2).max(32),
    ticker: z
      .string()
      .min(2)
      .max(13)
      .regex(/^\$?[A-Za-z0-9]{2,13}$/, 'Ticker must be 2–13 letters/numbers'),
    description: z.string().max(USER_DESCRIPTION_MAX).optional().default(''),
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
    /** Refuse sequential create→lock fallback (also settable via CREW_ATOMIC_REQUIRED=1). */
    atomicRequired: z.boolean().optional().default(false),
    /** Optional public launcher address for dry-run balance checks only. */
    launcherPubkey: solanaAddress.optional(),
  })
  .superRefine(refineLaunchBody)

const autohireBodySchema = z.object({
  name: z.string().max(32).optional().default(''),
  ticker: z.string().max(13).optional().default(''),
  description: z.string().max(USER_DESCRIPTION_MAX).optional().default(''),
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
  const doc = agentDiscoveryJson()
  if (doc.build?.commitShort) {
    res.setHeader('X-Crew-Build', doc.build.commitShort)
  }
  res.json(doc)
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
    const registered = await listRegisteredHireBoosts()
    const plan = planNarrativeHires(
      { name: body.name, ticker: body.ticker, vibe: body.description },
      { limit: body.seats, registered },
    )
    res.json({
      ok: true,
      seats: body.seats,
      match: plan.match,
      registeredPreferred: registered.length,
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
        registered: h.reasons.some((r) => /registered crew/i.test(r)),
      })),
      crew: plan.crew,
      disclaimer: AUTOHIRE_DISCLAIMER,
      tip: 'Registered KOLs are preferred when they match the narrative. Inspect hires/reasons, remix via crew[], or keep autoHire. Listing ≠ consent.',
    })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'autohire failed' })
  }
})

/**
 * Prefer per-request x-launcher-key. Server env fallback is opt-in only
 * (CREW_ALLOW_SERVER_LAUNCHER=1) so anonymous agents cannot spend a shared wallet.
 */
function resolveLauncherKey(req: { header(name: string): string | undefined }): string {
  const fromHeader = (req.header('x-launcher-key') || '').trim()
  if (fromHeader) return fromHeader
  const allowServer =
    process.env.CREW_ALLOW_SERVER_LAUNCHER === '1' ||
    process.env.CREW_ALLOW_SERVER_LAUNCHER === 'true'
  const fromEnv = process.env.CREW_AGENT_LAUNCHER_KEY?.trim()
  if (allowServer && fromEnv) return fromEnv
  throw new Error(
    'Provide x-launcher-key (agent Solana secret). Server CREW_AGENT_LAUNCHER_KEY is only used when CREW_ALLOW_SERVER_LAUNCHER=1.',
  )
}

function bodyToLaunchInput(body: z.infer<typeof launchBodySchema>): AgentLaunchInput {
  const image = body.imageUrl
    ? ({ kind: 'url', url: body.imageUrl } as const)
    : ({
        kind: 'base64',
        data: body.imageBase64!,
        contentType: body.imageContentType,
      } as const)

  return {
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
    atomicRequired: body.atomicRequired,
  }
}

agentRouter.post('/agent/launch/dry-run', requireAgentApiKey, async (req, res) => {
  try {
    const fp = apiKeyFingerprint(req)
    const ip = clientIp(req)
    if (!applyRateLimit(res, `dryrun:key:${fp}`, 60, 60_000)) return
    if (!applyRateLimit(res, `dryrun:ip:${ip}`, 120, 60_000)) return

    const body = launchBodySchema.parse(req.body)
    const result = await dryRunLaunchForAgent(bodyToLaunchInput(body), {
      launcherPubkey: body.launcherPubkey,
    })
    res.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'dry-run failed'
    const status = /unauthorized|api key/i.test(msg) ? 401 : 400
    res.status(status).json({ ok: false, error: msg })
  }
})

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
    let result = await launchForAgent(bodyToLaunchInput(body), launcher)
    if (!result.ok) {
      res.status(400).json(result)
      return
    }

    const agentKeyId = req.crewAgentAuth?.keyId
    // Persist to CREW board (best-effort) — stamp agent_key_id for launch history.
    try {
      await upsertCoin({
        ...result.coin,
        feeShareSignature: result.feeShareSignature,
        agentKeyId,
      } as ApiCoin)
    } catch (persistErr) {
      const msg = persistErr instanceof Error ? persistErr.message : 'persist failed'
      console.warn('agent launch persist failed', msg)
    }

    // Immediate one-shot wire retry when atomic/sequential lock failed (non-holderKol).
    if (!result.feeShareLocked && !result.coin.holderKol && result.coin.crew?.length) {
      try {
        const wired = await wireFeesForAgent({
          mint: result.mint,
          mode: deskModeOrDefault(result.mode),
          crew: result.coin.crew,
          launcher,
          name: result.coin.name,
          ticker: result.coin.ticker,
        })
        result = {
          ...result,
          feeShareLocked: true,
          feeShareSignature: wired.feeShareSignature,
          coin: { ...result.coin, feeShareSignature: wired.feeShareSignature, holderKol: false },
          warning: [
            result.warning,
            'Fee-shares locked on immediate post-launch wire retry.',
          ]
            .filter(Boolean)
            .join(' '),
        }
      } catch (wireErr) {
        const wireMsg = wireErr instanceof Error ? wireErr.message : 'wire retry failed'
        console.warn('agent launch wire retry failed', wireMsg)
        result = {
          ...result,
          warning: [
            result.warning,
            `Post-launch wire retry failed: ${wireMsg}. Call crew_wire_fees with { mint } (crew optional if board has crew).`,
          ]
            .filter(Boolean)
            .join(' '),
        }
      }
    }

    if (result.feeShareLocked && result.crew?.length) {
      try {
        await awardReferralHirePointsForCrew(
          result.mint,
          result.crew.map((m) => m.handle),
        )
      } catch (pointsErr) {
        console.warn(
          'referral hire points failed',
          pointsErr instanceof Error ? pointsErr.message : pointsErr,
        )
      }
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

    const payload = {
      ...result,
      nextSteps: launchNextSteps(result),
      disclaimer: AUTOHIRE_DISCLAIMER,
    }

    // 201 = fully locked; 202 = mint live but fee-share incomplete (agents must check feeShareLocked).
    const status = result.feeShareLocked ? 201 : 202
    if (idem) setIdempotent(`launch:${fp}:${idem}`, status, payload)
    res.status(status).json(payload)
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
    const mintParam = solanaAddress.parse(String(req.params.mint || ''))
    const status = await getAgentMintStatus(mintParam)
    res.json(status)
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'status failed' })
  }
})

const wireBodySchema = z
  .object({
    mint: solanaAddress,
    mode: z.enum(['split', 'buyback', 'raid', 'agent']).optional().default('agent'),
    name: z.string().max(32).optional(),
    ticker: z.string().max(13).optional(),
    /** Optional — when omitted, wire uses crew stored on the board from launch. */
    crew: z.array(crewMemberSchema).min(1).max(MAX_CREW).optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.crew?.length) return
    const shareSum = val.crew.reduce((s, m) => s + Math.round(Number(m.share) || 0), 0)
    if (shareSum !== 100) {
      ctx.addIssue({
        code: 'custom',
        message: `Crew shares must total 100% (now ${shareSum}%).`,
        path: ['crew'],
      })
    }
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
  mint: solanaAddress,
  mode: z.enum(['split', 'buyback', 'raid', 'agent']).optional().default('agent'),
  name: z.string().max(32).optional(),
  ticker: z.string().max(13).optional(),
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
    const mint = z.object({ mint: solanaAddress }).parse(req.body).mint
    // distributeCreatorFeesV2 is permissionless — prefer x-launcher-key, else CREW_OPS_KEY / buyback key.
    let payer
    try {
      const fromHeader = (req.header('x-launcher-key') || '').trim()
      payer = fromHeader ? parseLauncherKey(fromHeader) : resolveOpsPayer()
    } catch (keyErr) {
      res.status(400).json({
        ok: false,
        error:
          keyErr instanceof Error
            ? keyErr.message
            : 'Provide x-launcher-key or set CREW_OPS_KEY for permissionless crank.',
      })
      return
    }
    const result = await crankRemitsForAgent({ mint, payer })
    void emitWebhookEvent('remit.cranked', {
      mint: result.mint,
      signature: result.signature,
    })
    // Draft a @CrewPayHQ tag for operator approval — never auto-posts.
    void draftMentionFromRemit({
      mint: result.mint,
      signature: result.signature,
    }).catch(() => undefined)
    res.json(result)
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'crank failed' })
  }
})

agentRouter.get('/agent/launches', requireAgentApiKey, async (req, res) => {
  try {
    const fp = apiKeyFingerprint(req)
    if (!applyRateLimit(res, `launches:key:${fp}`, 60, 60_000)) return
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50))
    const keyId = req.crewAgentAuth?.keyId
    // DB keys see only their launches; operator env key sees recent board launches.
    const coins = keyId
      ? await listCoinsByAgentKey(keyId, limit)
      : await listCoins(limit)
    res.json({
      ok: true,
      scoped: Boolean(keyId),
      launches: coins.map((c) => ({
        mint: c.mint,
        name: c.name,
        ticker: c.ticker,
        mode: c.mode,
        feeShareLocked: Boolean(c.feeShareSignature),
        holderKol: Boolean(c.holderKol),
        signature: c.signature,
        feeShareSignature: c.feeShareSignature,
        pumpUrl: c.pumpUrl,
        launcher: c.launcher,
        launchedAt: c.launchedAt,
        agent: c.agent,
        agentKeyId: c.agentKeyId,
        crew: c.crew,
      })),
    })
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'list launches failed' })
  }
})

agentRouter.get('/agent/keys', requireAgentApiKey, async (req, res) => {
  try {
    const keyId = req.crewAgentAuth?.source === 'db' ? req.crewAgentAuth.keyId : undefined
    const keys = await listAgentKeys(keyId ? { keyId } : undefined)
    res.json({ ok: true, scoped: Boolean(keyId), keys })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'list keys failed' })
  }
})

/**
 * Self-serve key mint for agents (no operator bootstrap).
 * Rate-limited per IP. Returns crew_ak_… once; default launchesPerHour=5.
 */
agentRouter.post('/agent/keys/claim', async (req, res) => {
  try {
    const ip = clientIp(req)
    const claimLimit = takeRateLimit(`keys:claim:ip:${ip}`, {
      limit: 5,
      windowMs: 60 * 60_000,
    })
    res.setHeader('X-RateLimit-Limit', '5')
    res.setHeader('X-RateLimit-Remaining', String(claimLimit.remaining))
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(claimLimit.resetAt / 1000)))
    if (!claimLimit.ok) {
      res.setHeader('Retry-After', String(claimLimit.retryAfterSec))
      res.status(429).json({
        ok: false,
        error: 'Too many key claims from this IP (max 5/hour). Retry later or ask the operator.',
        retryAfterSec: claimLimit.retryAfterSec,
      })
      return
    }
    const body = z
      .object({
        label: z.string().min(2).max(64).default('agent'),
        agentName: z.string().min(2).max(48).optional(),
        model: z.string().min(1).max(48).optional(),
      })
      .parse(req.body ?? {})
    const parts = [body.label]
    if (body.agentName) parts.push(body.agentName)
    if (body.model) parts.push(body.model)
    const label = parts.join(':').slice(0, 64)
    const created = await createAgentKey({
      label,
      launchesPerHour: 5,
    })
    res.status(201).json({
      ok: true,
      key: created.key,
      row: created.row,
      tip: 'Store crew_ak_… once — it is not shown again. Pass as x-crew-api-key for writes. Launcher SOL stays in your wallet via x-launcher-key / CREW_LAUNCHER_KEY.',
      next: [
        'POST /api/agent/autohire with x-crew-api-key',
        'POST /api/agent/launch/dry-run',
        'POST /api/agent/launch with x-crew-api-key + x-launcher-key (own burner)',
      ],
    })
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'claim key failed' })
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
    const scope =
      req.crewAgentAuth?.source === 'db' && req.crewAgentAuth.keyId
        ? { keyId: req.crewAgentAuth.keyId }
        : undefined
    const ok = await revokeAgentKey(String(req.params.id || ''), scope)
    if (!ok) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'revoke failed' })
  }
})
