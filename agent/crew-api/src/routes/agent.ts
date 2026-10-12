import { Router } from 'express'
import { z } from 'zod'
import { apiKeyFingerprint, clientIp, readAgentKeyHeader, requireAgentApiKey } from '../lib/auth.js'
import {
  createAgentKey,
  getOwnerWalletByKeyId,
  listAgentKeys,
  revokeAgentKey,
  setAgentKeyRequireApproval,
} from '../lib/agent-keys.js'
import {
  agentReferralLink,
  assertReferralClaimAllowed,
  isSelfReferral,
  logReferralKeyClaim,
  resolveAgentReferrer,
  upsertCoinShareholders,
} from '../lib/agent-referral.js'
import { maxCrewSeats } from '../lib/agent/shareholders.js'
import { normalizeWallet, parseApproverAllowlist } from '../lib/agent/approver.js'
import {
  assertMaySetRequireApproval,
  resolveSpendGate,
} from '../lib/agent/spend-gate.js'
import { listCoinsByAgentKey, listCoins, upsertCoin, type ApiCoin } from '../lib/coins.js'
import {
  MAX_CREW,
  MAX_INITIAL_BUY_SOL,
  MIN_LAUNCH_FEE_SOL,
  MODE_DESK_BPS,
  USER_DESCRIPTION_MAX,
  platformBuybackBps,
} from '../lib/agent/constants.js'
import { agentDiscoveryJson } from '../lib/agent/discovery.js'
import {
  getIdempotent,
  normalizeIdempotencyKey,
  setIdempotent,
} from '../lib/agent/idempotency.js'
import { planNarrativeHires } from '../lib/agent/narrative.js'
import { awardReferralHirePointsForCrew } from '../lib/kol-register.js'
import { listRegisteredHireBoosts } from '../lib/registered-hires.js'
import { AUTOHIRE_DISCLAIMER, AUTOHIRE_SEATS_REQUEST_MAX, runAutohire } from '../lib/agent/autohire-run.js'
import { runUnsignedLaunch } from '../lib/agent/unsigned-build.js'
import {
  approveDryRunWithWallet,
  createDryRun,
  getDryRun,
  consumeApprovedDryRun,
  hashLaunchBody,
  hashWireBody,
  publicDryRunView,
  type DryRunIntent,
} from '../lib/agent/dry-run-store.js'
import { loadAgentImageBytes, sha256ImageBytes } from '../lib/agent/ipfs.js'
import { approveDryRunWalletFresh, requireApprovalWalletFresh } from '../lib/wallet-auth.js'
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
import { AGENT_EXAMPLES, errorIssues, errorMessage, normalizeAutoHireInput } from '../lib/agent/errors.js'
import { parseLauncherKey, resolveOpsPayer } from '../lib/agent/send.js'
import { solanaAddress } from '../lib/agent/solana-address.js'
import { evmAddress } from '../lib/agent/evm-address.js'
import { draftMentionFromRemit } from '../lib/kol-mentions.js'
import { emitWebhookEvent } from '../lib/webhooks.js'
import { assertPlatformReady, parseLaunchPlatform } from '../lib/agent/platforms.js'

export const agentRouter = Router()

const crewMemberSchema = z.object({
  handle: z.string().min(1).max(32),
  wallet: solanaAddress,
  share: z.number().int().min(1).max(100),
  hireRole: z.enum(['caller', 'chart', 'raid', 'kol', 'dev']).optional(),
  evmWallet: evmAddress.optional(),
})

const crewMemberSchemaFlexible = z.object({
  handle: z.string().min(1).max(32),
  wallet: z.string().min(20).max(64),
  share: z.number().int().min(1).max(100),
  hireRole: z.enum(['caller', 'chart', 'raid', 'kol', 'dev']).optional(),
  evmWallet: evmAddress.optional(),
})

/**
 * Build UNSIGNED launch transactions (create + optional fee-share lock) for local signing.
 * Returns v0 message base64 with required signer pubkeys and a suggested order.
 * The caller may submit directly to Solana RPC or POST them back to our submit endpoint.
 * `platform` defaults to pumpfun (existing behavior). bags = Bags.fm (Solana); zora = Zora coins (Base).
 */
const unsignedLaunchSchema = z
  .object({
    name: z.string().min(2).max(32),
    ticker: z.string().min(2).max(13).regex(/^\$?[A-Za-z0-9]{2,13}$/),
    description: z.string().max(USER_DESCRIPTION_MAX).optional().default(''),
    mode: z.enum(['split', 'buyback', 'raid', 'agent']).optional().default('agent'),
    twitter: z.string().max(128).optional(),
    website: z.string().max(256).optional(),
    initialBuySol: z.number().min(0).max(MAX_INITIAL_BUY_SOL).optional().default(0),
    imageUrl: z.string().url().optional(),
    imageBase64: z.string().min(64).optional(),
    imageContentType: z.string().max(64).optional(),
    crew: z.array(crewMemberSchemaFlexible).min(1).max(100).optional(),
    autoHire: z
      .preprocess(
        normalizeAutoHireInput,
        z.object({ seats: z.number().int().min(1).max(AUTOHIRE_SEATS_REQUEST_MAX).optional().default(5) }).optional(),
      )
      .optional(),
    optInOnly: z.boolean().optional().default(false),
    treasuryBps: z.number().int().min(2000).max(3000).optional(),
    platform: z.enum(['pumpfun', 'bags', 'zora']).optional().default('pumpfun'),
    launcherPubkey: z.string().min(20).max(64),
    mintPubkey: z.string().min(20).max(64).optional(),
  })
  .superRefine(refineLaunchBody)

agentRouter.post('/agent/launch/unsigned', requireAgentApiKey, async (req, res) => {
  try {
    const fp = apiKeyFingerprint(req)
    const ip = clientIp(req)
    if (!applyRateLimit(res, `unsigned:key:${fp}`, 30, 60_000)) return
    if (!applyRateLimit(res, `unsigned:ip:${ip}`, 60, 60_000)) return

    const body = unsignedLaunchSchema.parse(req.body)
    const result = await runUnsignedLaunch({
      ...body,
      keyId: req.crewAgentAuth?.keyId,
    })
    res.json(result)
  } catch (err) {
    res.status(400).json({ ok: false, error: errorMessage(err, 'unsigned build failed') })
  }
})

const submitSignedSchema = z.object({
  /** Signed txs: Solana base64 (Pump/Bags) or EVM hex (Zora), in builder order. */
  signed: z.array(z.string().min(64)).min(1).max(8),
  platform: z.enum(['pumpfun', 'bags', 'zora']).optional().default('pumpfun'),
})

agentRouter.post('/agent/launch/submit', requireAgentApiKey, async (req, res) => {
  try {
    const fp = apiKeyFingerprint(req)
    const ip = clientIp(req)
    if (!applyRateLimit(res, `unsigned-submit:key:${fp}`, 30, 60_000)) return
    if (!applyRateLimit(res, `unsigned-submit:ip:${ip}`, 60, 60_000)) return
    const body = submitSignedSchema.parse(req.body)
    const platform = parseLaunchPlatform(body.platform)
    const sigs: string[] = []
    if (platform === 'zora') {
      assertPlatformReady('zora')
      const { zoraRpcUrl } = await import('../lib/agent/platforms.js')
      for (const raw of body.signed) {
        const hex = raw.startsWith('0x') ? raw : `0x${Buffer.from(raw, 'base64').toString('hex')}`
        const resRpc = await fetch(zoraRpcUrl(), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_sendRawTransaction', params: [hex] }),
        })
        const json = (await resRpc.json()) as { result?: string; error?: { message?: string } }
        if (json.error?.message) throw new Error(json.error.message)
        if (!json.result) throw new Error('Zora submit missing tx hash')
        sigs.push(json.result)
      }
    } else {
      if (platform === 'bags') assertPlatformReady('bags')
      const connection = (await import('../lib/agent/send.js')).getConnection()
      for (const b64 of body.signed) {
        const raw = Buffer.from(b64, 'base64')
        const sig = await connection.sendRawTransaction(raw, {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          maxRetries: 3,
        })
        sigs.push(sig)
      }
    }
    res.status(201).json({
      ok: true,
      platform,
      signatures: sigs,
      tip: 'Submitted signed transactions. Always verify on chain and check feeShareLocked via /api/agent/status/:mint.',
    })
  } catch (err) {
    res.status(400).json({ ok: false, error: errorMessage(err, 'submit failed') })
  }
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
        message: errorMessage(err, 'Invalid imageUrl'),
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
        message: errorMessage(err, 'Invalid website'),
        path: ['website'],
      })
    }
  }
}

/** Requested seats may exceed the fee-map cap; handler clamps + warns. */
// moved earlier

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
    autoHire: z.preprocess(
      normalizeAutoHireInput,
      z
        .object({
          seats: z.number().int().min(1).max(AUTOHIRE_SEATS_REQUEST_MAX).optional().default(5),
        })
        .optional(),
    ),
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
    /**
     * Required on dry-run when the key has requireApproval=true.
     * Must match the spend-time x-launcher-key pubkey. Cannot approve.
     */
    launcherPubkey: solanaAddress.optional(),
    /**
     * Optional unless the API key has requireApproval=true.
     * From POST /api/agent/launch/dry-run (+ approval when required).
     */
    dryRunId: z.string().min(16).max(64).optional(),
    platform: z.enum(['pumpfun', 'bags', 'zora']).optional().default('pumpfun'),
  })
  .superRefine(refineLaunchBody)

const autohireBodySchema = z.object({
  name: z.string().max(32).optional().default(''),
  ticker: z.string().max(13).optional().default(''),
  description: z.string().max(USER_DESCRIPTION_MAX).optional().default(''),
  seats: z.number().int().min(1).max(AUTOHIRE_SEATS_REQUEST_MAX).optional().default(5),
  optInOnly: z.boolean().optional().default(false),
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
    const result = await runAutohire({
      ...body,
      keyId: req.crewAgentAuth?.keyId,
    })
    res.json(result)
  } catch (err) {
    res.status(400).json({
      ok: false,
      error: errorMessage(err, 'autohire failed'),
      issues: errorIssues(err),
      example: AGENT_EXAMPLES.autohire,
    })
  }
})

/**
 * Zero-friction "try it": no API key, no image, works with GET query params
 * (for browse-only LLMs) or a POST JSON body. Read-only — creates no key,
 * no dry-run record and spends nothing. Returns the crew Autohire would pick,
 * the fee map, and the exact next calls.
 */
const quickstartSchema = z.object({
  name: z.string().max(32).optional().default(''),
  ticker: z.string().max(13).optional().default(''),
  description: z.string().max(USER_DESCRIPTION_MAX).optional().default(''),
  seats: z.coerce.number().int().min(1).max(AUTOHIRE_SEATS_REQUEST_MAX).optional().default(5),
})

async function handleQuickstart(
  raw: Record<string, unknown>,
  req: import('express').Request,
  res: import('express').Response,
) {
  try {
    if (!applyRateLimit(res, `quickstart:ip:${clientIp(req)}`, 30, 60_000)) return
    const body = quickstartSchema.parse(raw)
    const name = body.name.trim() || 'Night Owl'
    const ticker = (body.ticker.trim() || 'HOOT').replace(/^\$/, '').toUpperCase()
    const description = body.description.trim() || 'An owl that only trades after midnight.'
    const usedExample = !body.name.trim() && !body.ticker.trim() && !body.description.trim()
    const seats = Math.min(maxCrewSeats({ hasAgentReferrer: false }), body.seats)
    const registered = await listRegisteredHireBoosts()
    const plan = planNarrativeHires({ name, ticker, vibe: description }, { limit: seats, registered })
    const platformBps = platformBuybackBps(false)
    const deskBps = MODE_DESK_BPS.agent
    const crewPoolBps = 10_000 - platformBps - deskBps
    const launchBody = { name, ticker, description, imageUrl: 'https://<your-public-image>.png' }
    res.setHeader('Cache-Control', 'no-store')
    res.json({
      ok: true,
      quickstart: true,
      usedExample,
      note: usedExample
        ? 'No name/ticker/description given — showing an example. Pass ?name=&ticker=&description= (GET) or a JSON body (POST).'
        : 'Preview only — nothing was created and no SOL was spent.',
      coin: { name, ticker, description },
      crew: plan.hires.map((h) => ({
        handle: `@${h.kol.x || h.kol.pump}`,
        wallet: h.kol.wallet,
        sharePctOfCrewPool: h.share,
        effectiveBps: Math.round((h.share / 100) * crewPoolBps),
        registered: h.reasons.some((r) => /registered crew/i.test(r)),
        reasons: h.reasons,
      })),
      feeMap: {
        crewPoolBps,
        agentBps: deskBps,
        platformBps,
        referredAlternative: '60/15/5/20 when your key was claimed with a KOL referral code',
      },
      costs: { minSol: MIN_LAUNCH_FEE_SOL, note: 'A real launch needs ≥0.02 SOL on your launcher wallet (+ optional initial buy).' },
      disclaimer: AUTOHIRE_DISCLAIMER,
      next: [
        { step: 1, call: 'POST https://api.crewpay.dev/api/agent/keys/claim', body: {}, returns: 'crew_ak_… (store once)' },
        {
          step: 2,
          call: 'GET https://api.crewpay.dev/api/kols?limit=50',
          headers: {},
          body: null,
          returns: 'browse KOLs — pick explicit crew wallets first (preferred)',
        },
        {
          step: 3,
          call: 'POST https://api.crewpay.dev/api/agent/launch/dry-run',
          headers: { 'x-crew-api-key': 'crew_ak_…' },
          body: { ...launchBody, crew: [{ handle: '@alice', wallet: '<pubkey>', share: 50, hireRole: 'kol' }, { handle: '@bob', wallet: '<pubkey>', share: 50, hireRole: 'caller' }] },
          returns: 'validate explicit crew, fee map, cost — no SOL spent',
        },
        {
          step: 4,
          call: 'POST https://api.crewpay.dev/api/agent/launch',
          headers: { 'x-crew-api-key': 'crew_ak_…', 'x-launcher-key': '<launcher secret, env only>' },
          body: { ...launchBody, crew: '…as above…' },
          returns: 'mint + feeShareLocked (MAINNET, spends SOL)',
        },
        {
          step: 'Fallback',
          call: 'POST https://api.crewpay.dev/api/agent/autohire',
          headers: { 'x-crew-api-key': 'crew_ak_…' },
          body: { name, ticker, description, seats },
          returns: 'convenience Autohire plan when you cannot pick explicit crew',
        },
      ],
      mcp: { hosted: 'https://mcp.crewpay.dev/mcp', local: 'npx -y crewpay-mcp' },
      docs: 'https://crewpay.dev/llms.txt',
    })
  } catch (err) {
    res.status(400).json({ ok: false, error: errorMessage(err, 'quickstart failed'), issues: errorIssues(err) })
  }
}

agentRouter.get('/agent/quickstart', (req, res) => {
  void handleQuickstart(req.query as Record<string, unknown>, req, res)
})
agentRouter.post('/agent/quickstart', (req, res) => {
  const raw = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}
  void handleQuickstart(raw, req, res)
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

const wireDryRunBodySchema = z
  .object({
    intent: z.literal('wire-fees'),
    mint: solanaAddress,
    mode: z.enum(['split', 'buyback', 'raid', 'agent']).optional().default('agent'),
    name: z.string().max(32).optional(),
    ticker: z.string().max(13).optional(),
    crew: z.array(crewMemberSchema).min(1).max(MAX_CREW).optional(),
    /** Required when requireApproval=true — burner that will sign wire-fees; cannot approve. */
    launcherPubkey: solanaAddress.optional(),
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

async function resolveLaunchImageSha(body: {
  imageUrl?: string
  imageBase64?: string
  imageContentType?: string
}): Promise<string> {
  const image = body.imageUrl
    ? ({ kind: 'url', url: body.imageUrl } as const)
    : ({
        kind: 'base64',
        data: body.imageBase64!,
        contentType: body.imageContentType,
      } as const)
  const { buf } = await loadAgentImageBytes(image)
  return sha256ImageBytes(buf)
}

agentRouter.post('/agent/launch/dry-run', requireAgentApiKey, async (req, res) => {
  try {
    const fp = apiKeyFingerprint(req)
    const ip = clientIp(req)
    if (!applyRateLimit(res, `dryrun:key:${fp}`, 60, 60_000)) return
    if (!applyRateLimit(res, `dryrun:ip:${ip}`, 120, 60_000)) return

    const raw = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}
    const intent: DryRunIntent = raw.intent === 'wire-fees' ? 'wire-fees' : 'launch'
    const site = (process.env.CREW_SITE_URL || 'https://crewpay.dev').replace(/\/$/, '')
    const requireApproval = Boolean(req.crewAgentAuth?.requireApproval)

    if (intent === 'wire-fees') {
      const body = wireDryRunBodySchema.parse(raw)
      const launcherPubkey = body.launcherPubkey ? normalizeWallet(body.launcherPubkey) : null
      if (requireApproval && !launcherPubkey) {
        res.status(400).json({
          ok: false,
          error: 'launcherPubkey is required on dry-runs when requireApproval is true',
        })
        return
      }
      const bodyHash = hashWireBody(body as unknown as Record<string, unknown>)
      const plan = {
        ok: true,
        intent: 'wire-fees' as const,
        mint: body.mint,
        mode: body.mode,
        name: body.name,
        ticker: body.ticker,
        crew: body.crew,
        launcherPubkey,
        note: 'Wire-fees dry-run — no SOL spent until POST /api/agent/wire-fees',
      }
      const rec = await createDryRun({
        apiKeyFp: fp,
        intent: 'wire-fees',
        bodyHash,
        imageSha256: null,
        plan,
        launcherPubkey,
        requireLauncher: requireApproval,
      })
      const approvalUrl = `${site}/approve/${rec.id}`
      res.json({
        ...plan,
        dryRunId: rec.id,
        approvalUrl,
        requireApproval,
        expiresAt: new Date(rec.expiresAt).toISOString(),
        tip: requireApproval
          ? 'requireApproval=true — open approvalUrl with a CREWPAY_APPROVER_WALLETS wallet (not the launcher), then wire-fees with dryRunId + matching x-launcher-key.'
          : 'Approval is optional. Call POST /api/agent/wire-fees with the same body (+ optional dryRunId). Operators can require human approval per key.',
      })
      return
    }

    const body = launchBodySchema.parse(raw)
    const platform = parseLaunchPlatform(body.platform)
    assertPlatformReady(platform)
    const launcherPubkey =
      platform === 'zora'
        ? body.launcherPubkey
          ? body.launcherPubkey.trim()
          : null
        : body.launcherPubkey
          ? normalizeWallet(body.launcherPubkey)
          : null
    if (requireApproval && !launcherPubkey) {
      res.status(400).json({
        ok: false,
        error: 'launcherPubkey is required on dry-runs when requireApproval is true',
      })
      return
    }
    const imageSha256 = await resolveLaunchImageSha(body)
    const agentKeyId = req.crewAgentAuth?.keyId
    const ownerWallet = agentKeyId ? await getOwnerWalletByKeyId(agentKeyId) : null
    const result = await dryRunLaunchForAgent(bodyToLaunchInput(body), {
      launcherPubkey: launcherPubkey || undefined,
      agentKeyId,
      ownerWallet,
    })
    const bodyHash = hashLaunchBody(body as unknown as Record<string, unknown>, imageSha256)
    const rec = await createDryRun({
      apiKeyFp: fp,
      intent: 'launch',
      bodyHash,
      imageSha256,
      launcherPubkey,
      requireLauncher: requireApproval,
      plan: { ...result, imageSha256, launcherPubkey },
    })
    const approvalUrl = `${site}/approve/${rec.id}`
    res.json({
      ...result,
      platform,
      imageSha256,
      launcherPubkey,
      policy: result.hirePlan?.policy || 'score',
      dryRunId: rec.id,
      approvalUrl,
      requireApproval,
      expiresAt: new Date(rec.expiresAt).toISOString(),
      tip: requireApproval
        ? 'requireApproval=true — open approvalUrl with a CREWPAY_APPROVER_WALLETS wallet (not the launcher), then launch with dryRunId + matching x-launcher-key.'
        : 'Approval is optional. Call POST /api/agent/launch with the same body (+ optional dryRunId). Operators can require human approval per key.',
    })
  } catch (err) {
    const msg = errorMessage(err, 'dry-run failed')
    const status = /unauthorized|api key/i.test(msg) ? 401 : 400
    const issues = errorIssues(err)
    res
      .status(status)
      .json(issues ? { ok: false, error: msg, issues, example: AGENT_EXAMPLES.launch } : { ok: false, error: msg })
  }
})

/** Public read of a dry-run plan (for the human approval page). */
agentRouter.get('/agent/launch/dry-run/:id', async (req, res) => {
  const rec = await getDryRun(String(req.params.id || ''))
  if (!rec) {
    res.status(404).json({ ok: false, error: 'Unknown or expired dryRunId' })
    return
  }
  res.json({ ok: true, ...publicDryRunView(rec) })
})

/**
 * Human approval — wallet signature only.
 * Rejects agent API keys so a compromised crew_ak_… cannot self-approve.
 */
agentRouter.post('/agent/launch/dry-run/:id/approve', async (req, res) => {
  try {
    const id = String(req.params.id || '')
    if (readAgentKeyHeader(req)) {
      res.status(403).json({
        ok: false,
        error:
          'Approve rejects agent API keys — open the approval page and sign with a wallet (operator login).',
      })
      return
    }
    if ((req.body && typeof req.body === 'object' && ('token' in req.body || 'approveToken' in req.body)) ||
      req.query.t ||
      req.query.token
    ) {
      res.status(400).json({
        ok: false,
        error: 'Approve tokens are not accepted — connect a wallet on /approve/:dryRunId and sign.',
      })
      return
    }
    const signed = approveDryRunWalletFresh({
      header: (n) => req.header(n),
      body: { ...(typeof req.body === 'object' && req.body ? req.body : {}), dryRunId: id },
    })
    if (!signed || signed.dryRunId !== id) {
      res.status(401).json({
        ok: false,
        error:
          'Wallet signature required — headers x-crew-wallet, x-crew-timestamp, x-crew-signature, x-crew-dry-run-id (message crew-approve-dry-run:{id}:{ts}).',
      })
      return
    }
    const rec = await approveDryRunWithWallet(id, signed.wallet)
    res.json({
      ok: true,
      dryRunId: rec.id,
      intent: rec.intent,
      approved: true,
      approvedAt: new Date(rec.approvedAt!).toISOString(),
      approvedByWallet: rec.approvedByWallet,
      tip: 'Dry-run approved. Call the matching spend endpoint with the same body + dryRunId.',
    })
  } catch (err) {
    const msg = errorMessage(err, 'approve failed')
    const status =
      /allowlist|Approvals disabled|cannot approve|Launcher\/burner/i.test(msg) ? 403 : 400
    res.status(status).json({ ok: false, error: msg })
  }
})

agentRouter.post('/agent/launch', requireAgentApiKey, async (req, res) => {
  try {
    const fp = apiKeyFingerprint(req)
    const ip = clientIp(req)
    const launchLimit = req.crewAgentAuth?.launchesPerHour ?? 5
    if (!applyRateLimit(res, `launch:key:${fp}`, launchLimit, 3_600_000)) return
    if (!applyRateLimit(res, `launch:ip:${ip}`, 10, 60_000)) return

    let idem: string | null = null
    try {
      idem = normalizeIdempotencyKey(req.header('x-idempotency-key') || undefined)
    } catch (err) {
      res.status(400).json({ ok: false, error: errorMessage(err, 'bad idempotency key') })
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
    const requireApproval = Boolean(req.crewAgentAuth?.requireApproval)
    let gate: ReturnType<typeof resolveSpendGate>
    try {
      gate = resolveSpendGate({ requireApproval, dryRunId: body.dryRunId })
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: errorMessage(err, 'dry-run gate failed'),
      })
      return
    }
    let launcher
    try {
      launcher = parseLauncherKey(resolveLauncherKey(req))
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: errorMessage(err, 'launcher key required'),
      })
      return
    }
    let imageSha256: string
    try {
      imageSha256 = await resolveLaunchImageSha(body)
      if (gate === 'consume' && body.dryRunId) {
        const bodyHash = hashLaunchBody(body as unknown as Record<string, unknown>, imageSha256)
        await consumeApprovedDryRun({
          dryRunId: body.dryRunId,
          apiKeyFp: fp,
          intent: 'launch',
          bodyHash,
          imageSha256,
          launcherPubkey: launcher.publicKey.toBase58(),
          requireApproval,
        })
      }
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: errorMessage(err, 'dry-run gate failed'),
      })
      return
    }
    const agentKeyId = req.crewAgentAuth?.keyId
    const ownerWallet = agentKeyId ? await getOwnerWalletByKeyId(agentKeyId) : null
    let result = await launchForAgent(bodyToLaunchInput(body), launcher, {
      agentKeyId,
      ownerWallet,
    })
    if (!result.ok) {
      res.status(400).json(result)
      return
    }

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

    if (result.feeShareLocked && result.shareholders?.length) {
      try {
        await upsertCoinShareholders(result.mint, result.shareholders)
      } catch (shareErr) {
        console.warn(
          'coin_shareholders persist failed',
          shareErr instanceof Error ? shareErr.message : shareErr,
        )
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
    const msg = errorMessage(err, 'launch failed')
    // Never include header material; Zod issues are safe.
    const status = /unauthorized|launcher key|api key/i.test(msg) ? 401 : 400
    const issues = errorIssues(err)
    res
      .status(status)
      .json(issues ? { ok: false, error: msg, issues, example: AGENT_EXAMPLES.launch } : { ok: false, error: msg })
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
    res.status(400).json({ ok: false, error: errorMessage(err, 'status failed') })
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
    /** Optional unless requireApproval=true on the API key. */
    dryRunId: z.string().min(16).max(64).optional(),
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
    const requireApproval = Boolean(req.crewAgentAuth?.requireApproval)
    let gate: ReturnType<typeof resolveSpendGate>
    try {
      gate = resolveSpendGate({ requireApproval, dryRunId: body.dryRunId })
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: errorMessage(err, 'dry-run gate failed'),
      })
      return
    }
    let launcher
    try {
      launcher = parseLauncherKey(resolveLauncherKey(req))
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: errorMessage(err, 'launcher key required'),
      })
      return
    }
    try {
      if (gate === 'consume' && body.dryRunId) {
        const bodyHash = hashWireBody(body as unknown as Record<string, unknown>)
        await consumeApprovedDryRun({
          dryRunId: body.dryRunId,
          apiKeyFp: fp,
          intent: 'wire-fees',
          bodyHash,
          launcherPubkey: launcher.publicKey.toBase58(),
          requireApproval,
        })
      }
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: errorMessage(err, 'dry-run gate failed'),
      })
      return
    }
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
    res.status(400).json({ ok: false, error: errorMessage(err, 'wire-fees failed') })
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
      .json({ ok: false, error: errorMessage(err, 'lock-holder-kol failed') })
  }
})

agentRouter.post('/agent/crank', requireAgentApiKey, async (req, res) => {
  try {
    const fp = apiKeyFingerprint(req)
    if (!applyRateLimit(res, `crank:key:${fp}`, 20, 60_000)) return
    const mint = z.object({ mint: solanaAddress }).parse(req.body).mint
  // Require x-launcher-key unless board fee-share is locked.
    let payer
    try {
    const fromHeader = (req.header('x-launcher-key') || '').trim()
    if (fromHeader) {
      payer = parseLauncherKey(fromHeader)
    } else {
      const status = await getAgentMintStatus(mint)
      if (!status.feeShareLocked) {
        throw new Error(
          'x-launcher-key required — fee-share not locked on board; server ops payer disabled',
        )
      }
      payer = resolveOpsPayer()
    }
    } catch (keyErr) {
      res.status(400).json({
        ok: false,
        error:
          keyErr instanceof Error
            ? keyErr.message
          : 'Provide x-launcher-key (or lock fee-shares to allow server ops payer).',
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
    res.status(400).json({ ok: false, error: errorMessage(err, 'crank failed') })
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
    res.status(400).json({ ok: false, error: errorMessage(err, 'list launches failed') })
  }
})

agentRouter.get('/agent/keys', requireAgentApiKey, async (req, res) => {
  try {
    const keyId = req.crewAgentAuth?.source === 'db' ? req.crewAgentAuth.keyId : undefined
    const keys = await listAgentKeys(keyId ? { keyId } : undefined)
    res.json({ ok: true, scoped: Boolean(keyId), keys })
  } catch (err) {
    res.status(500).json({ error: errorMessage(err, 'list keys failed') })
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
        referralCode: z.string().min(2).max(24).optional(),
      })
      .parse(req.body ?? {})
    if (
      req.body &&
      typeof req.body === 'object' &&
      ('ownerWallet' in req.body || 'owner_wallet' in req.body)
    ) {
      res.status(403).json({
        ok: false,
        error:
          'ownerWallet cannot be set via agent API keys — approvals use CREWPAY_APPROVER_WALLETS only',
      })
      return
    }
    let referralCode: string | null = null
    let referrer: Awaited<ReturnType<typeof resolveAgentReferrer>> | null = null
    const parts = [body.label]
    if (body.agentName) parts.push(body.agentName)
    if (body.model) parts.push(body.model)
    const label = parts.join(':').slice(0, 64)
    if (body.referralCode?.trim()) {
      try {
        referrer = await resolveAgentReferrer(body.referralCode)
        if (
          isSelfReferral({
            referrerWallet: referrer.wallet,
            referrerXUsername: referrer.xUsername,
            agentLabel: label,
            ownerXUsername: body.agentName,
          })
        ) {
          res.status(400).json({
            ok: false,
            error:
              'Self-referral blocked — referralCode must not match your agent/KOL identity. Use another KOL code.',
          })
          return
        }
        await assertReferralClaimAllowed(referrer, { claimIp: ip })
        referralCode = referrer.code
      } catch (err) {
        res.status(400).json({
          ok: false,
          error: errorMessage(err, 'Invalid referralCode'),
        })
        return
      }
    }
    const created = await createAgentKey({
      label,
      launchesPerHour: 5,
      referralCode,
    })
    if (referrer) {
      await logReferralKeyClaim({
        keyId: created.row.id,
        fingerprint: created.row.fingerprint,
        referralCode: referrer.code,
        referrerWallet: referrer.wallet,
        referrerHandle: referrer.handle,
        label,
        ip,
      })
    }
    res.status(201).json({
      ok: true,
      key: created.key,
      row: created.row,
      referral: referrer
        ? {
            code: referrer.code,
            handle: referrer.handle,
            wallet: referrer.wallet,
            link: agentReferralLink(referrer.code),
            note: 'Bound permanently on this key — referred launches use fee map 60/15/5/20 (crew/agent/referrer/treasury). Max 7 crew seats when referred.',
          }
        : null,
      tip: 'Store crew_ak_… once — it is not shown again. Pass as x-crew-api-key for writes. Launcher SOL stays in your wallet via x-launcher-key / CREW_LAUNCHER_KEY. Approval is optional (requireApproval defaults false). Operators can require human approval per key. Pass referralCode at claim to bind a KOL referrer (immutable).',
      next: [
        'POST /api/agent/autohire with x-crew-api-key',
        'POST /api/agent/launch with x-crew-api-key + x-launcher-key (optional dry-run first)',
        'Optional: POST /api/agent/keys/require-approval to opt into human approval',
      ],
    })
  } catch (err) {
    res.status(400).json({ ok: false, error: errorMessage(err, 'claim key failed') })
  }
})

agentRouter.post('/agent/keys', requireAgentApiKey, async (req, res) => {
  try {
    if (req.crewAgentAuth?.source !== 'env') {
      res.status(403).json({ error: 'Operator env key required to create agent keys' })
      return
    }
    if (
      req.body &&
      typeof req.body === 'object' &&
      ('ownerWallet' in req.body || 'owner_wallet' in req.body)
    ) {
      res.status(403).json({
        ok: false,
        error:
          'ownerWallet cannot be set via agent API keys — approvals use CREWPAY_APPROVER_WALLETS only',
      })
      return
    }
    const body = z
      .object({
        label: z.string().min(2).max(64),
        launchesPerHour: z.number().int().min(1).max(100).optional(),
      })
      .parse(req.body)
    const created = await createAgentKey({
      label: body.label,
      launchesPerHour: body.launchesPerHour,
    })
    res.status(201).json({
      ok: true,
      key: created.key,
      row: created.row,
      tip: 'Store the key once — it is not shown again.',
    })
  } catch (err) {
    res.status(400).json({ error: errorMessage(err, 'create key failed') })
  }
})

/**
 * Toggle requireApproval on a DB-backed API key.
 * - Agent API key: may turn ON only (never OFF).
 * - CREWPAY_APPROVER_WALLETS wallet signature: may turn ON or OFF.
 *   Message: crew-require-approval:{keyId}:{0|1}:{ts}
 */
agentRouter.post('/agent/keys/require-approval', requireAgentApiKey, async (req, res) => {
  try {
    const body = z
      .object({
        keyId: z.string().min(4).max(64).optional(),
        requireApproval: z.boolean(),
      })
      .parse(req.body ?? {})

    const operator = requireApprovalWalletFresh({
      header: (n) => req.header(n),
      body,
    })
    const allow = parseApproverAllowlist()
    const viaOperator =
      Boolean(operator) &&
      allow.includes(normalizeWallet(operator!.wallet) || '') &&
      Boolean(operator!.keyId)

    const keyId = viaOperator
      ? operator!.keyId
      : req.crewAgentAuth?.source === 'db'
        ? req.crewAgentAuth.keyId
        : body.keyId

    if (!keyId) {
      res.status(400).json({
        ok: false,
        error: 'keyId required (DB-backed crew_ak_… key, or operator wallet signature with keyId)',
      })
      return
    }

    // Scoped agent keys may only toggle themselves.
    if (
      !viaOperator &&
      req.crewAgentAuth?.source === 'db' &&
      req.crewAgentAuth.keyId &&
      req.crewAgentAuth.keyId !== keyId
    ) {
      res.status(403).json({ ok: false, error: 'Cannot change requireApproval on another key' })
      return
    }

    const next = viaOperator ? operator!.requireApproval : body.requireApproval
    try {
      assertMaySetRequireApproval({
        next,
        viaAgentApiKey: !viaOperator,
      })
    } catch (err) {
      res.status(403).json({
        ok: false,
        error: errorMessage(err, 'not allowed'),
      })
      return
    }

    const ok = await setAgentKeyRequireApproval({ keyId, requireApproval: next })
    if (!ok) {
      res.status(404).json({ ok: false, error: 'Key not found' })
      return
    }
    res.json({
      ok: true,
      keyId,
      requireApproval: next,
      tip: next
        ? 'Launches now require an approved dryRunId. dry-run must include launcherPubkey.'
        : 'Approval optional again — launch/wire-fees work with the API key alone.',
    })
  } catch (err) {
    res.status(400).json({
      ok: false,
      error: errorMessage(err, 'set requireApproval failed'),
    })
  }
})

/**
 * Agents cannot register approver wallets (self-approve bypass).
 * Approvals trust CREWPAY_APPROVER_WALLETS only.
 */
agentRouter.post('/agent/keys/owner', requireAgentApiKey, async (_req, res) => {
  res.status(403).json({
    ok: false,
    error:
      'ownerWallet cannot be set or changed with an agent API key — approvals use CREWPAY_APPROVER_WALLETS only',
  })
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
    res.status(500).json({ error: errorMessage(err, 'revoke failed') })
  }
})

/**
 * Agents often probe POST endpoints with GET (seen in logs as 404s).
 * Answer with 405 + the exact call instead of a bare 404.
 */
const POST_ONLY = [
  '/agent/autohire',
  '/agent/launch',
  '/agent/launch/dry-run',
  '/agent/keys/claim',
  '/agent/wire-fees',
  '/agent/crank',
  '/agent/lock-holder-kol',
]
for (const path of POST_ONLY) {
  agentRouter.get(path, (_req, res) => {
    res.setHeader('Allow', 'POST')
    res.status(405).json({
      ok: false,
      error: `Use POST /api${path} (JSON body).`,
      tryWithoutKey: 'GET https://api.crewpay.dev/api/agent/quickstart?name=Night%20Owl&ticker=HOOT&description=owl%20coin',
      claimKey: 'POST https://api.crewpay.dev/api/agent/keys/claim',
      docs: 'https://crewpay.dev/llms.txt',
    })
  })
}
