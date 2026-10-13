import { Router } from 'express'
import { z } from 'zod'
import { requireAgentApiKey } from '../lib/auth.js'
import { verifyWalletSignature } from '../lib/wallet-auth.js'
import { memoryJobs } from '../lib/jobs/store.js'
import {
  type ChainId,
  type AssetSymbol,
  clampBigint,
  formatAmountFromBigint,
  nowMs,
  parseAmountToBigint,
} from '../lib/jobs/types.js'
import { defaultVerifier } from '../lib/jobs/verifier.js'
import { railFor } from '../lib/jobs/settlement.js'
import { jobsPlatformFeeBps, jobsPlatformFeeWallet } from '../lib/jobs/config.js'
import {
  applyCoinJobTemplate,
  isCoinJobChainId,
  isCoinJobTemplateId,
  listCoinJobTemplates,
} from '../lib/jobs/templates.js'
import { jobToJson } from '../lib/jobs/serialize.js'
import { coinPageUrl } from '../lib/coin-page.js'
import { getCoin } from '../lib/coins.js'
import { notifyJobOpenTelegram } from '../lib/telegram-kol.js'

export const jobsRouter = Router()

const chainIdSchema = z.enum([
  'solana-devnet',
  'solana',
  'evm:base-sepolia',
  'evm:base',
  'evm:ethereum',
  'flop-testnet',
]) as unknown as z.ZodType<ChainId>

const assetSchema = z.enum(['SOL', 'USDC', 'ETH', 'USDT']) as unknown as z.ZodType<AssetSymbol>

const rulesSchema = z
  .object({
    requiredTicker: z.string().min(1).max(24).optional(),
    requiredLink: z.string().url().max(256).optional(),
    minPostAgeHours: z.number().int().min(0).max(72).optional().default(0),
    platform: z.enum(['x', 'any']).optional().default('x'),
    deliverableKind: z
      .enum(['meme-pack', 'banner-logo', 'x-upkeep', 'website-polish', 'x-post'])
      .optional(),
    minUrls: z.number().int().min(1).max(32).optional(),
    postsPerWeek: z.number().int().min(1).max(21).optional(),
  })
  .optional()
  .default({ platform: 'x', minPostAgeHours: 0 })

const createCampaignSchema = z.object({
  type: z.enum(['campaign', 'content', 'design', 'research', 'community', 'feedback']).optional().default('campaign'),
  chainId: chainIdSchema,
  asset: assetSchema,
  budget: z.number().positive(),
  perProofAmount: z.number().positive(),
  maxProofs: z.number().int().min(1).max(10_000),
  perKOLCap: z.number().int().min(1).max(1000).default(5),
  // absolute ms or relative hours; one must be provided
  deadlineMs: z.number().int().positive().optional(),
  deadlineHours: z.number().int().min(1).max(720).optional(),
  rules: rulesSchema,
  mint: z.string().min(32).max(64).optional(),
  templateId: z.string().max(32).optional(),
})

const postCoinJobSchema = z.object({
  mint: z.string().min(32).max(64),
  template: z.enum(['meme-pack', 'banner-logo', 'x-upkeep', 'website-polish']),
  chainId: chainIdSchema,
  asset: assetSchema,
  budget: z.number().positive().optional(),
  perProofAmount: z.number().positive().optional(),
  maxProofs: z.number().int().min(1).max(10_000).optional(),
  perKOLCap: z.number().int().min(1).max(1000).optional(),
  deadlineHours: z.number().int().min(1).max(720).optional(),
  postsPerWeek: z.number().int().min(1).max(21).optional(),
  ticker: z.string().min(1).max(16).optional(),
  fund: z.boolean().optional(),
  rail: z.string().max(32).optional(),
  from: z.string().max(128).optional(),
})

function resolveDeadlineMs(input: { deadlineMs?: number; deadlineHours?: number }): number {
  if (input.deadlineMs && input.deadlineMs > nowMs() + 60_000) return input.deadlineMs
  if (input.deadlineHours && input.deadlineHours > 0) return nowMs() + input.deadlineHours * 60 * 60_000
  throw new Error('Provide deadlineMs (absolute, >1m) or deadlineHours (>0)')
}

jobsRouter.post('/jobs/campaigns/dry-run', requireAgentApiKey, (req, res) => {
  try {
    const body = createCampaignSchema.parse(req.body ?? {})
    const budget = parseAmountToBigint(body.budget)
    const per = parseAmountToBigint(body.perProofAmount)
    if (per <= 0n) throw new Error('perProofAmount must be > 0')
    const maxByBudget = Number(budget / per)
    const deadline = resolveDeadlineMs(body)
    res.json({
      ok: true,
      plan: {
        chainId: body.chainId,
        asset: body.asset,
        budget: formatAmountFromBigint(budget),
        perProofAmount: formatAmountFromBigint(per),
        maxProofs: Math.min(body.maxProofs, maxByBudget),
        perKOLCap: body.perKOLCap,
        deadline,
        rules: body.rules,
      },
      note: 'Dry-run only — not persisted. Settlement is devnet/simulated in this phase.',
    })
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'dry-run failed' })
  }
})

jobsRouter.post('/jobs/campaigns', requireAgentApiKey, (req, res) => {
  try {
    const body = createCampaignSchema.parse(req.body ?? {})
    const budget = parseAmountToBigint(body.budget)
    const per = parseAmountToBigint(body.perProofAmount)
    if (per <= 0n) throw new Error('perProofAmount must be > 0')
    // Strictly create the job record (escrow is separate /fund call)
    const job = memoryJobs.createCampaign({
      createdBy: req.crewAgentAuth?.keyId || req.crewAgentAuth?.fingerprint || 'unknown',
      chainId: body.chainId,
      asset: body.asset,
      budget,
      perProofAmount: per,
      maxProofs: body.maxProofs,
      perKOLCap: body.perKOLCap,
      deadline: resolveDeadlineMs(body),
      rules: body.rules ?? { platform: 'x' },
      type: body.type,
      mint: body.mint,
      templateId: body.templateId,
    })
    res.status(201).json({ ok: true, job: jobToJson(job) })
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'create failed' })
  }
})

jobsRouter.post('/jobs/:id/fund', requireAgentApiKey, async (req, res) => {
  try {
    const id = String(req.params.id || '')
    const job = memoryJobs.getJob(id)
    if (!job) {
      res.status(404).json({ ok: false, error: 'Job not found' })
      return
    }
    const railName = (typeof req.body?.rail === 'string' ? req.body.rail : '').trim().toLowerCase()
    const rail = railFor(job.chainId, railName || process.env.JOBS_RAIL)
    const ctx = { chainId: job.chainId, asset: job.asset }
    const from = typeof req.body?.from === 'string' ? req.body.from : undefined
    const { escrow } = await rail.fund(ctx, { amount: job.budget, from })
    const locked = await rail.lock(ctx, escrow)
    const vf = await rail.verifyFunding(ctx, escrow)
    job.escrowRef = escrow.ref || escrow.id
    job.status = vf.ok ? 'funded' : 'created'
    memoryJobs.setJob(job)
    const rec = memoryJobs.addFunding(job.id, rail.name, job.budget, vf.ok, vf.detail)
    res.status(201).json({ ok: true, job: jobToJson(job), funding: rec, locked, verify: vf })
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'fund failed' })
  }
})

jobsRouter.get('/jobs/templates', (_req, res) => {
  res.json({
    ok: true,
    templates: listCoinJobTemplates(),
    note: 'Creative presets on the existing jobs + escrow flow. Test/devnet only. No earnings promises.',
  })
})

jobsRouter.get('/jobs/open', (req, res) => {
  const mint = typeof req.query.mint === 'string' ? req.query.mint.trim() : undefined
  const list = memoryJobs.listOpen(mint)
  res.json({ ok: true, jobs: list.map(jobToJson) })
})

function applyPostedCoinJob(body: z.infer<typeof postCoinJobSchema>, coin: { ticker: string; mint: string } | null) {
  if (!isCoinJobChainId(body.chainId)) {
    throw new Error('Coin jobs are test/devnet only (solana-devnet, evm:base-sepolia, flop-testnet)')
  }
  if (!isCoinJobTemplateId(body.template)) {
    throw new Error('Unknown template')
  }
  return applyCoinJobTemplate({
    template: body.template,
    mint: body.mint,
    ticker: body.ticker || coin?.ticker,
    pageUrl: coinPageUrl(body.mint),
    budget: body.budget,
    perProofAmount: body.perProofAmount,
    maxProofs: body.maxProofs,
    perKOLCap: body.perKOLCap,
    deadlineHours: body.deadlineHours,
    postsPerWeek: body.postsPerWeek,
    chainId: body.chainId,
    asset: body.asset,
  })
}

jobsRouter.post('/jobs/coin/dry-run', requireAgentApiKey, async (req, res) => {
  try {
    const body = postCoinJobSchema.parse(req.body ?? {})
    const coin = await getCoin(body.mint).catch(() => null)
    const plan = applyPostedCoinJob(body, coin)
    res.json({
      ok: true,
      plan: {
        ...plan,
        pageUrl: coinPageUrl(body.mint),
        ticker: coin?.ticker || body.ticker || null,
        coinFound: Boolean(coin),
      },
      note: 'Dry-run only — not persisted. Settlement is devnet/simulated. No mainnet. No earnings promises.',
    })
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'dry-run failed' })
  }
})

jobsRouter.post('/jobs/coin', requireAgentApiKey, async (req, res) => {
  try {
    const body = postCoinJobSchema.parse(req.body ?? {})
    const coin = await getCoin(body.mint).catch(() => null)
    const plan = applyPostedCoinJob(body, coin)
    const job = memoryJobs.createCampaign({
      createdBy: req.crewAgentAuth?.keyId || req.crewAgentAuth?.fingerprint || 'unknown',
      chainId: plan.chainId,
      asset: plan.asset,
      budget: parseAmountToBigint(plan.budget),
      perProofAmount: parseAmountToBigint(plan.perProofAmount),
      maxProofs: plan.maxProofs,
      perKOLCap: plan.perKOLCap,
      deadline: nowMs() + plan.deadlineHours * 60 * 60_000,
      rules: plan.rules,
      type: plan.type,
      mint: plan.mint,
      templateId: plan.templateId,
    })
    let funding: unknown
    if (body.fund) {
      const railName = (body.rail || process.env.JOBS_RAIL || 'sim').trim().toLowerCase()
      if (railName !== 'sim' && railName !== 'flop-tclk') {
        throw new Error('Optional fund on post_coin_job is sim/flop-tclk only (no mainnet)')
      }
      const rail = railFor(job.chainId, railName)
      const ctx = { chainId: job.chainId, asset: job.asset }
      const funded = await rail.fund(ctx, { amount: job.budget, from: body.from })
      await rail.lock(ctx, funded.escrow)
      const vf = await rail.verifyFunding(ctx, funded.escrow)
      job.escrowRef = funded.escrow.ref || funded.escrow.id
      job.status = vf.ok ? 'funded' : 'created'
      memoryJobs.setJob(job)
      funding = memoryJobs.addFunding(job.id, rail.name, job.budget, vf.ok, vf.detail)
    }
    void notifyJobOpenTelegram({
      mint: body.mint,
      jobId: job.id,
      template: plan.templateId || body.template,
      crew: coin?.crew,
    }).catch(() => {})
    res.status(201).json({
      ok: true,
      job: jobToJson(job),
      funding: funding || null,
      pageUrl: coinPageUrl(body.mint),
      note: 'Created on the existing jobs + escrow flow. Humans claim, deliver, then get paid after verification. Test/devnet only.',
    })
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'create failed' })
  }
})

function buildClaimMessage(jobId: string, timestamp: number) {
  return `crew-job-claim:${jobId}:${timestamp}`
}
function buildSubmitMessage(jobId: string, timestamp: number) {
  return `crew-job-submit:${jobId}:${timestamp}`
}

jobsRouter.post('/jobs/:id/claim', async (req, res) => {
  try {
    const id = String(req.params.id || '')
    const job = memoryJobs.getJob(id)
    if (!job) {
      res.status(404).json({ ok: false, error: 'Job not found' })
      return
    }
    // Wallet auth (Solana-style) — for EVM stubs, accept body.kolWallet without signature for now.
    const wallet = (req.header('x-crew-wallet') || '').trim()
    const tsRaw = (req.header('x-crew-timestamp') || '').trim()
    const signature = (req.header('x-crew-signature') || '').trim()
    const timestamp = Number(tsRaw)
    const kolHandle = typeof req.body?.kolHandle === 'string' ? req.body.kolHandle : undefined
    if (job.chainId.startsWith('solana')) {
      if (!wallet || !tsRaw || !signature || !Number.isFinite(timestamp)) {
        res.status(401).json({ ok: false, error: 'Wallet signature required for Solana jobs' })
        return
      }
      const msg = buildClaimMessage(id, timestamp)
      const ok = verifyWalletSignature({ wallet, message: msg, signatureBase58: signature })
      if (!ok) {
        res.status(401).json({ ok: false, error: 'Invalid wallet signature' })
        return
      }
    } else if (!wallet) {
      // EVM stub path — accept body-provided address
      res.status(400).json({ ok: false, error: 'Provide x-crew-wallet for now (EVM stubs to follow)' })
      return
    }
    const claim = memoryJobs.claimJob(id, wallet, job.chainId, kolHandle)
    res.status(201).json({ ok: true, claim })
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'claim failed' })
  }
})

jobsRouter.post('/jobs/:id/submit', async (req, res) => {
  try {
    const id = String(req.params.id || '')
    const job = memoryJobs.getJob(id)
    if (!job) {
      res.status(404).json({ ok: false, error: 'Job not found' })
      return
    }
    const wallet = (req.header('x-crew-wallet') || '').trim()
    const tsRaw = (req.header('x-crew-timestamp') || '').trim()
    const signature = (req.header('x-crew-signature') || '').trim()
    const timestamp = Number(tsRaw)
    if (job.chainId.startsWith('solana')) {
      if (!wallet || !tsRaw || !signature || !Number.isFinite(timestamp)) {
        res.status(401).json({ ok: false, error: 'Wallet signature required' })
        return
      }
      const msg = buildSubmitMessage(id, timestamp)
      const ok = verifyWalletSignature({ wallet, message: msg, signatureBase58: signature })
      if (!ok) {
        res.status(401).json({ ok: false, error: 'Invalid wallet signature' })
        return
      }
    } else if (!wallet) {
      res.status(400).json({ ok: false, error: 'Provide x-crew-wallet for now (EVM stubs to follow)' })
      return
    }
    // Find the claimant for this wallet (latest claim wins)
    const claims = memoryJobs.findClaims(id).filter((c) => c.kolWallet === wallet)
    if (!claims.length) {
      res.status(404).json({ ok: false, error: 'No active claim for this wallet' })
      return
    }
    const claim = claims.sort((a, b) => b.createdAt - a.createdAt)[0]
    const urls = Array.isArray(req.body?.urls) ? (req.body.urls as unknown[]).map(String) : []
    if (!urls.length) {
      res.status(400).json({ ok: false, error: 'Provide urls[]' })
      return
    }
    const sub = memoryJobs.submit(claim.id, urls as string[])
    res.status(201).json({ ok: true, submission: sub, claimId: claim.id })
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'submit failed' })
  }
})

jobsRouter.post('/jobs/:id/verify', requireAgentApiKey, async (req, res) => {
  try {
    const id = String(req.params.id || '')
    const job = memoryJobs.getJob(id)
    if (!job) {
      res.status(404).json({ ok: false, error: 'Job not found' })
      return
    }
    const claimId = typeof req.body?.claimId === 'string' ? req.body.claimId : undefined
    const subId = typeof req.body?.submissionId === 'string' ? req.body.submissionId : undefined
    const claims = claimId ? memoryJobs.findClaims(id).filter((c) => c.id === claimId) : memoryJobs.findClaims(id)
    if (!claims.length) {
      res.status(404).json({ ok: false, error: 'No claim found' })
      return
    }
    const claim = claims[0]
    const submissions = subId
      ? memoryJobs.listSubmissionsForClaim(claim.id).filter((s) => s.id === subId)
      : memoryJobs.listSubmissionsForClaim(claim.id).sort((a, b) => b.createdAt - a.createdAt)
    const sub = submissions[0]
    if (!sub) {
      res.status(404).json({ ok: false, error: 'No submission found' })
      return
    }
    const approve = Boolean(req.body && typeof req.body === 'object' && (req.body.approve === true))
    const verifier = defaultVerifier(job.rules.deliverableKind)
    const vi = approve
      ? { ok: true, acceptedUrls: sub.urls.slice(0, 1), details: { approvedByAgent: true } }
      : await verifier.verify({
          platform: job.rules.platform === 'any' ? 'any' : 'x',
          kolHandle: claim.kolHandle,
          urls: sub.urls,
          requiredTicker: job.rules.requiredTicker,
          requiredLink: job.rules.requiredLink,
          minPostAgeHours: job.rules.minPostAgeHours,
          minUrls: job.rules.minUrls,
          deliverableKind: job.rules.deliverableKind,
        })
    sub.verification = vi
    if (vi.ok) {
      sub.verifiedAt = nowMs()
      claim.status = 'verified'
    } else {
      claim.status = 'rejected'
    }
    res.json({ ok: vi.ok, verification: vi, submission: sub, claim })
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'verify failed' })
  }
})

jobsRouter.post('/jobs/:id/payout', requireAgentApiKey, async (req, res) => {
  try {
    const id = String(req.params.id || '')
    const job = memoryJobs.getJob(id)
    if (!job) {
      res.status(404).json({ ok: false, error: 'Job not found' })
      return
    }
    if (!job.escrowRef) {
      res.status(400).json({ ok: false, error: 'Job not funded' })
      return
    }
    const rail = railFor(job.chainId, process.env.JOBS_RAIL)
    const ctx = { chainId: job.chainId, asset: job.asset }
    const claimId = typeof req.body?.claimId === 'string' ? req.body.claimId : undefined
    const claims = claimId ? memoryJobs.findClaims(id).filter((c) => c.id === claimId) : memoryJobs.findClaims(id)
    if (!claims.length) {
      res.status(404).json({ ok: false, error: 'No claim found' })
      return
    }
    const claim = claims[0]
    const submissions = memoryJobs.listSubmissionsForClaim(claim.id).filter((s) => s.verification?.ok)
    if (!submissions.length) {
      res.status(400).json({ ok: false, error: 'No verified submissions' })
      return
    }
    // Compute payable proofs under caps
    const verifiedCount = submissions.reduce((n, s) => n + (s.verification?.acceptedUrls?.length || 0), 0)
    const maxByBudget = Number(job.budget / job.perProofAmount)
    const maxAllowed = Math.min(job.maxProofs, job.perKOLCap, maxByBudget)
    const proofsToPay = Math.min(verifiedCount, maxAllowed)
    if (proofsToPay <= 0) {
      res.json({ ok: true, note: 'Nothing to pay under current caps' })
      return
    }
    const amount = clampBigint(job.perProofAmount * BigInt(proofsToPay), 0n, job.budget)
    const feeBps = jobsPlatformFeeBps()
    const feeWallet = jobsPlatformFeeWallet()
    const feeAmount = feeBps > 0 && feeWallet ? (amount * BigInt(feeBps)) / 10_000n : 0n
    const kolAmount = amount - feeAmount
    const from = typeof req.body?.from === 'string' ? req.body.from : undefined
    const rel = await rail.release(
      ctx,
      { id: job.escrowRef, rail: rail.name },
      { to: claim.kolWallet, amount: kolAmount, from },
    )
    // Non-custodial rails return unsigned payload; do not mutate budget/paid status here.
    res.status(201).json({
      ok: true,
      requiresSignature: Boolean(rel.unsigned),
      paidProofs: proofsToPay,
      kolAmount: formatAmountFromBigint(kolAmount),
      platformFee: feeAmount > 0n ? { bps: feeBps, wallet: feeWallet, amount: formatAmountFromBigint(feeAmount) } : null,
      unsigned: rel.unsigned,
      txRef: rel.txRef,
      claimId: claim.id,
      tip: rel.unsigned
        ? 'Non-custodial: sign and submit the unsigned transaction(s) from your wallet to pay the KOL (and platform fee when set).'
        : undefined,
    })
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'payout failed' })
  }
})

jobsRouter.post('/jobs/:id/refund', requireAgentApiKey, async (req, res) => {
  try {
    const id = String(req.params.id || '')
    const job = memoryJobs.getJob(id)
    if (!job) {
      res.status(404).json({ ok: false, error: 'Job not found' })
      return
    }
    if (!job.escrowRef) {
      res.status(400).json({ ok: false, error: 'Job not funded' })
      return
    }
    const to = String(req.body?.to || '').trim()
    if (!to) {
      res.status(400).json({ ok: false, error: 'Provide refund address in body.to' })
      return
    }
    const rail = railFor(job.chainId, process.env.JOBS_RAIL)
    const ctx = { chainId: job.chainId, asset: job.asset }
    const out = await rail.refund(ctx, { id: job.escrowRef, rail: rail.name }, { to })
    job.status = 'refunded'
    memoryJobs.setJob(job)
    res.json({ ok: true, txRef: out.txRef })
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'refund failed' })
  }
})

