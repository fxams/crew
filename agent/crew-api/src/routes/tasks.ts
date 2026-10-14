import { Router } from 'express'
import { z } from 'zod'
import { readAgentKeyHeader, requireAgentApiKey } from '../lib/auth.js'
import { matchAgentKey } from '../lib/agent-keys.js'
import { createHash } from 'node:crypto'
import { assertAllowlistedApprover } from '../lib/agent/approver.js'
import { verifyWalletSignature } from '../lib/wallet-auth.js'
import { getKolByWallet } from '../lib/kols.js'
import { memoryJobs } from '../lib/jobs/store.js'
import { jobToJson } from '../lib/jobs/serialize.js'
import { railFor } from '../lib/jobs/settlement.js'
import {
  formatAmountFromBigint,
  nowMs,
  parseAmountToBigint,
  type ChainId,
  type AssetSymbol,
} from '../lib/jobs/types.js'
import { jobsPlatformFeeBps, jobsPlatformFeeWallet } from '../lib/jobs/config.js'
import {
  processAutoReleases,
  runAutoChecksOnSubmission,
  slotsRemaining,
} from '../lib/jobs/tasks-flow.js'
import { clampBigint } from '../lib/jobs/types.js'

export const tasksRouter = Router()

const chainIdSchema = z.enum([
  'solana-devnet',
  'solana',
  'evm:base-sepolia',
  'evm:base',
  'evm:ethereum',
  'flop-testnet',
]) as unknown as z.ZodType<ChainId>

const assetSchema = z.enum(['SOL', 'USDC', 'ETH', 'USDT']) as unknown as z.ZodType<AssetSymbol>

const autoChecksSchema = z
  .object({
    requireHttpsUrls: z.boolean().optional(),
    urlReachable: z.boolean().optional(),
    xPost: z.boolean().optional(),
    requiredTicker: z.string().max(24).optional(),
    requiredLink: z.string().url().max(256).optional(),
    minUrls: z.number().int().min(0).max(32).optional(),
    minTextLength: z.number().int().min(0).max(100_000).optional(),
    keyword: z.string().max(256).optional(),
    regex: z.string().max(256).optional(),
    fileExtensions: z.array(z.string().max(16)).max(16).optional(),
    minFiles: z.number().int().min(0).max(32).optional(),
    maxFiles: z.number().int().min(0).max(64).optional(),
  })
  .optional()

const postTaskSchema = z.object({
  title: z.string().min(3).max(120),
  spec: z.string().min(10).max(20_000),
  taskCategory: z.string().max(64).optional(),
  type: z.enum(['task', 'content', 'design', 'research', 'community', 'feedback']).optional(),
  chainId: chainIdSchema,
  asset: assetSchema,
  budget: z.number().positive(),
  rewardPerSlot: z.number().positive(),
  slots: z.number().int().min(1).max(10_000),
  slotsPerWorker: z.number().int().min(1).max(100).default(1),
  deadlineMs: z.number().int().positive().optional(),
  deadlineHours: z.number().int().min(1).max(720).optional(),
  autoChecks: autoChecksSchema,
  objectionWindowHours: z.number().int().min(0).max(168).optional(),
  fund: z.boolean().optional(),
  rail: z.string().max(32).optional(),
  from: z.string().max(128).optional(),
})

function resolveDeadlineMs(input: { deadlineMs?: number; deadlineHours?: number }): number {
  if (input.deadlineMs && input.deadlineMs > nowMs() + 60_000) return input.deadlineMs
  if (input.deadlineHours && input.deadlineHours > 0) return nowMs() + input.deadlineHours * 60 * 60_000
  throw new Error('Provide deadlineMs (absolute, >1m) or deadlineHours (>0)')
}

function tasksRequireRegisteredKol(): boolean {
  const v = (process.env.TASKS_REQUIRE_REGISTERED_KOL || 'true').trim().toLowerCase()
  return v !== '0' && v !== 'false'
}

function buildClaimMessage(jobId: string, timestamp: number) {
  return `crew-task-claim:${jobId}:${timestamp}`
}
function buildSubmitMessage(jobId: string, timestamp: number) {
  return `crew-task-submit:${jobId}:${timestamp}`
}
function buildDisputeMessage(jobId: string, timestamp: number) {
  return `crew-task-dispute:${jobId}:${timestamp}`
}

async function attachAgentAuthIfPresent(req: import('express').Request) {
  const got = readAgentKeyHeader(req)
  if (!got) return
  try {
    const dbKey = await matchAgentKey(got)
    if (dbKey) {
      req.crewAgentAuth = {
        source: 'db',
        fingerprint: dbKey.fingerprint,
        launchesPerHour: dbKey.launchesPerHour,
        keyId: dbKey.id,
        requireApproval: dbKey.requireApproval,
      }
      return
    }
  } catch {
    /* optional */
  }
  const agentKey = process.env.CREW_AGENT_API_KEY?.trim()
  const boardKey = process.env.CREW_API_KEY?.trim()
  const expected = agentKey || boardKey
  if (expected && got === expected) {
    req.crewAgentAuth = {
      source: 'env',
      fingerprint: createHash('sha256').update(got).digest('hex').slice(0, 16),
      requireApproval:
        process.env.CREW_REQUIRE_APPROVAL === '1' || process.env.CREW_REQUIRE_APPROVAL === 'true',
    }
  }
}

async function fundTaskJob(
  jobId: string,
  opts: { rail?: string; from?: string },
): Promise<{ job: ReturnType<typeof jobToJson>; funding: unknown; unsigned?: unknown }> {
  const job = memoryJobs.getJob(jobId)
  if (!job || job.mode !== 'task') throw new Error('Task not found')
  const railName = (opts.rail || process.env.JOBS_RAIL || 'sim').trim().toLowerCase()
  if (railName !== 'sim' && railName !== 'flop-tclk' && !job.chainId.startsWith('solana') && !job.chainId.startsWith('evm:')) {
    throw new Error('Unsupported rail for task fund')
  }
  const rail = railFor(job.chainId, railName)
  const ctx = { chainId: job.chainId, asset: job.asset }
  const from = opts.from?.trim()
  const { escrow, unsigned } = await rail.fund(ctx, { amount: job.budget, from })
  await rail.lock(ctx, escrow)
  const vf = await rail.verifyFunding(ctx, escrow)
  job.escrowRef = escrow.ref || escrow.id
  job.escrowFrom = from || null
  job.status = vf.ok ? 'funded' : 'created'
  memoryJobs.setJob(job)
  const funding = memoryJobs.addFunding(job.id, rail.name, job.budget, vf.ok, vf.detail)
  return { job: jobToJson(job), funding, unsigned }
}

tasksRouter.post('/tasks', requireAgentApiKey, async (req, res) => {
  try {
    const body = postTaskSchema.parse(req.body ?? {})
    const budget = parseAmountToBigint(body.budget)
    const reward = parseAmountToBigint(body.rewardPerSlot)
    const maxPay = reward * BigInt(body.slots)
    if (maxPay > budget) {
      throw new Error('budget must cover rewardPerSlot × slots')
    }
    const job = memoryJobs.createTask({
      createdBy: req.crewAgentAuth?.keyId || req.crewAgentAuth?.fingerprint || 'unknown',
      title: body.title,
      spec: body.spec,
      taskCategory: body.taskCategory,
      type: body.type,
      chainId: body.chainId,
      asset: body.asset,
      budget,
      rewardPerSlot: reward,
      slots: body.slots,
      slotsPerWorker: body.slotsPerWorker,
      deadline: resolveDeadlineMs(body),
      autoChecks: body.autoChecks,
      objectionWindowHours: body.objectionWindowHours,
    })
    let fundPayload: Awaited<ReturnType<typeof fundTaskJob>> | null = null
    if (body.fund) {
      fundPayload = await fundTaskJob(job.id, { rail: body.rail, from: body.from })
    }
    res.status(201).json({
      ok: true,
      task: fundPayload?.job || jobToJson(job),
      funding: fundPayload?.funding || null,
      unsigned: fundPayload?.unsigned || null,
      platformFeeBps: jobsPlatformFeeBps(),
      note:
        'Generic task on jobs+escrow. Workers claim with wallet; auto-checks may auto-release after objection window. Platform fee defaults to 0 (JOBS_PLATFORM_FEE_BPS). Launch fee map unchanged.',
    })
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'post failed' })
  }
})

tasksRouter.get('/tasks', async (req, res) => {
  try {
    const category = typeof req.query.category === 'string' ? req.query.category : undefined
    const list = memoryJobs.listTasks({ category })
    const enriched = []
    for (const j of list) {
      await processAutoReleases(j)
      enriched.push({
        ...jobToJson(j),
        slotsRemaining: slotsRemaining(j),
        openDispute: memoryJobs.getOpenDispute(j.id),
      })
    }
    res.json({ ok: true, tasks: enriched })
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'list failed' })
  }
})

tasksRouter.get('/tasks/:id', async (req, res) => {
  const id = String(req.params.id || '')
  const job = memoryJobs.getJob(id)
  if (!job || job.mode !== 'task') {
    res.status(404).json({ ok: false, error: 'Task not found' })
    return
  }
  const auto = await processAutoReleases(job)
  res.json({
    ok: true,
    task: {
      ...jobToJson(job),
      slotsRemaining: slotsRemaining(job),
      openDispute: memoryJobs.getOpenDispute(job.id),
    },
    autoReleases: auto,
  })
})

tasksRouter.post('/tasks/:id/fund', requireAgentApiKey, async (req, res) => {
  try {
    const id = String(req.params.id || '')
    const out = await fundTaskJob(id, {
      rail: typeof req.body?.rail === 'string' ? req.body.rail : undefined,
      from: typeof req.body?.from === 'string' ? req.body.from : undefined,
    })
    res.status(201).json({ ok: true, ...out })
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'fund failed' })
  }
})

tasksRouter.post('/tasks/:id/claim', async (req, res) => {
  try {
    const id = String(req.params.id || '')
    const job = memoryJobs.getJob(id)
    if (!job || job.mode !== 'task') {
      res.status(404).json({ ok: false, error: 'Task not found' })
      return
    }
    if (job.status === 'disputed' || job.status === 'frozen') {
      res.status(409).json({ ok: false, error: 'Task funds frozen (dispute open)' })
      return
    }
    if (job.deadline <= nowMs()) {
      res.status(400).json({ ok: false, error: 'Task past deadline' })
      return
    }
    const wallet = (req.header('x-crew-wallet') || '').trim()
    const tsRaw = (req.header('x-crew-timestamp') || '').trim()
    const signature = (req.header('x-crew-signature') || '').trim()
    const timestamp = Number(tsRaw)
    const kolHandle = typeof req.body?.kolHandle === 'string' ? req.body.kolHandle : undefined

    if (job.chainId.startsWith('solana')) {
      if (!wallet || !tsRaw || !signature || !Number.isFinite(timestamp)) {
        res.status(401).json({ ok: false, error: 'Wallet signature required' })
        return
      }
      const msg = buildClaimMessage(id, timestamp)
      if (!verifyWalletSignature({ wallet, message: msg, signatureBase58: signature })) {
        res.status(401).json({ ok: false, error: 'Invalid wallet signature' })
        return
      }
    } else if (!wallet) {
      res.status(400).json({ ok: false, error: 'Provide x-crew-wallet' })
      return
    }

    if (tasksRequireRegisteredKol()) {
      const kol = await getKolByWallet(wallet).catch(() => null)
      if (!kol) {
        res.status(403).json({
          ok: false,
          error: 'Registered KOL/worker required — register at https://crewpay.dev/register',
        })
        return
      }
    }

    const claim = memoryJobs.claimJob(id, wallet, job.chainId, kolHandle)
    res.status(201).json({ ok: true, claim, slotsRemaining: slotsRemaining(job) })
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'claim failed' })
  }
})

tasksRouter.post('/tasks/:id/submit', async (req, res) => {
  try {
    const id = String(req.params.id || '')
    const job = memoryJobs.getJob(id)
    if (!job || job.mode !== 'task') {
      res.status(404).json({ ok: false, error: 'Task not found' })
      return
    }
    if (job.status === 'disputed' || job.status === 'frozen') {
      res.status(409).json({ ok: false, error: 'Task funds frozen (dispute open)' })
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
      if (!verifyWalletSignature({ wallet, message: msg, signatureBase58: signature })) {
        res.status(401).json({ ok: false, error: 'Invalid wallet signature' })
        return
      }
    } else if (!wallet) {
      res.status(400).json({ ok: false, error: 'Provide x-crew-wallet' })
      return
    }
    const claims = memoryJobs.findClaims(id).filter((c) => c.kolWallet === wallet)
    if (!claims.length) {
      res.status(404).json({ ok: false, error: 'No claim for this wallet' })
      return
    }
    const claim = claims.sort((a, b) => b.createdAt - a.createdAt)[0]
    const urls = Array.isArray(req.body?.urls) ? (req.body.urls as unknown[]).map(String) : []
    const text = typeof req.body?.text === 'string' ? req.body.text : undefined
    const files = Array.isArray(req.body?.files) ? req.body.files : undefined
    if (!urls.length && !text && (!files || !files.length)) {
      res.status(400).json({ ok: false, error: 'Provide urls[], text, and/or files[]' })
      return
    }
    let sub = memoryJobs.submit(claim.id, { urls, text, files })
    sub = await runAutoChecksOnSubmission(job, sub, claim.kolHandle)
    memoryJobs.setSubmission(sub)
    if (sub.verification?.ok) {
      claim.status = 'submitted'
    }
    res.status(201).json({
      ok: true,
      submission: sub,
      claimId: claim.id,
      autoReleaseEligibleAt: sub.autoReleaseEligibleAt,
      checks: sub.verification,
    })
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'submit failed' })
  }
})

tasksRouter.post('/tasks/:id/approve', requireAgentApiKey, async (req, res) => {
  try {
    const id = String(req.params.id || '')
    const job = memoryJobs.getJob(id)
    if (!job || job.mode !== 'task') {
      res.status(404).json({ ok: false, error: 'Task not found' })
      return
    }
    const claimId = typeof req.body?.claimId === 'string' ? req.body.claimId : undefined
    const claims = claimId
      ? memoryJobs.findClaims(id).filter((c) => c.id === claimId)
      : memoryJobs.findClaims(id)
    if (!claims.length) {
      res.status(404).json({ ok: false, error: 'No claim found' })
      return
    }
    const claim = claims[0]
    const subs = memoryJobs.listSubmissionsForClaim(claim.id).sort((a, b) => b.createdAt - a.createdAt)
    const sub = subs[0]
    if (!sub) {
      res.status(404).json({ ok: false, error: 'No submission' })
      return
    }
    const object = Boolean(req.body?.object)
    if (object) {
      memoryJobs.objectToAutoRelease(claim.id)
      res.json({ ok: true, objected: true, submissionId: sub.id })
      return
    }
    sub.verification = { ok: true, details: { approvedByAgent: true }, acceptedUrls: sub.urls }
    sub.verifiedAt = nowMs()
    sub.autoReleaseEligibleAt = nowMs()
    memoryJobs.setSubmission(sub)
    claim.status = 'verified'
    const rail = railFor(job.chainId, process.env.JOBS_RAIL)
    const amount = clampBigint(job.perProofAmount, 0n, job.budget)
    const feeBps = jobsPlatformFeeBps()
    const feeWallet = jobsPlatformFeeWallet()
    const feeAmount = feeBps > 0 && feeWallet ? (amount * BigInt(feeBps)) / 10_000n : 0n
    const kolAmount = amount - feeAmount
    const from = typeof req.body?.from === 'string' ? req.body.from : job.escrowFrom || undefined
    const rel = await rail.release(
      { chainId: job.chainId, asset: job.asset },
      { id: job.escrowRef!, rail: rail.name },
      { to: claim.kolWallet, amount: kolAmount, from },
    )
    res.status(201).json({
      ok: true,
      requiresSignature: Boolean(rel.unsigned),
      kolAmount: formatAmountFromBigint(kolAmount),
      platformFeeBps: feeBps,
      unsigned: rel.unsigned,
      txRef: rel.txRef,
      claimId: claim.id,
    })
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'approve failed' })
  }
})

tasksRouter.post('/tasks/:id/dispute', async (req, res) => {
  try {
    await attachAgentAuthIfPresent(req)
    const id = String(req.params.id || '')
    const job = memoryJobs.getJob(id)
    if (!job || job.mode !== 'task') {
      res.status(404).json({ ok: false, error: 'Task not found' })
      return
    }
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : ''
    if (reason.length < 8) {
      res.status(400).json({ ok: false, error: 'Provide reason (min 8 chars)' })
      return
    }
    const claimId = typeof req.body?.claimId === 'string' ? req.body.claimId : undefined
    const asAgent = Boolean(req.crewAgentAuth)
    const wallet = (req.header('x-crew-wallet') || '').trim()
    const tsRaw = (req.header('x-crew-timestamp') || '').trim()
    const signature = (req.header('x-crew-signature') || '').trim()
    const timestamp = Number(tsRaw)

    let openedBy: 'agent' | 'worker'
    if (asAgent) {
      openedBy = 'agent'
    } else {
      if (!wallet || !signature || !Number.isFinite(timestamp)) {
        res.status(401).json({ ok: false, error: 'Worker dispute requires wallet signature' })
        return
      }
      const msg = buildDisputeMessage(id, timestamp)
      if (!verifyWalletSignature({ wallet, message: msg, signatureBase58: signature })) {
        res.status(401).json({ ok: false, error: 'Invalid wallet signature' })
        return
      }
      openedBy = 'worker'
    }
    const dispute = memoryJobs.openDispute({ jobId: id, claimId, openedBy, reason })
    job.status = 'frozen'
    memoryJobs.setJob(job)
    res.status(201).json({ ok: true, dispute, status: 'frozen' })
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'dispute failed' })
  }
})

tasksRouter.post('/tasks/:id/resolve-dispute', async (req, res) => {
  try {
    const id = String(req.params.id || '')
    const job = memoryJobs.getJob(id)
    if (!job || job.mode !== 'task') {
      res.status(404).json({ ok: false, error: 'Task not found' })
      return
    }
    const dispute = memoryJobs.getOpenDispute(id)
    if (!dispute) {
      res.status(404).json({ ok: false, error: 'No open dispute' })
      return
    }
    const resolution = req.body?.resolution === 'refund' ? 'refund' : 'release'
    const wallet = (req.header('x-crew-wallet') || '').trim()
    const tsRaw = (req.header('x-crew-timestamp') || '').trim()
    const signature = (req.header('x-crew-signature') || '').trim()
    const timestamp = Number(tsRaw)
    if (!wallet || !signature || !Number.isFinite(Number(tsRaw))) {
      res.status(401).json({ ok: false, error: 'Admin wallet signature required' })
      return
    }
    const msg = `crew-task-resolve:${id}:${dispute.id}:${resolution}:${timestamp}`
    if (!verifyWalletSignature({ wallet, message: msg, signatureBase58: signature })) {
      res.status(401).json({ ok: false, error: 'Invalid wallet signature' })
      return
    }
    const admin = assertAllowlistedApprover(wallet)
    const resolved = memoryJobs.resolveDispute(dispute.id, resolution, admin)
    const rail = railFor(job.chainId, process.env.JOBS_RAIL)
    const ctx = { chainId: job.chainId, asset: job.asset }
    let unsigned: unknown
    if (resolution === 'refund') {
      const to = typeof req.body?.to === 'string' ? req.body.to.trim() : job.escrowFrom || ''
      if (!to) throw new Error('Provide refund to address')
      const out = await rail.refund(ctx, { id: job.escrowRef!, rail: rail.name }, {
        to,
        from: job.escrowFrom || undefined,
      })
      unsigned = out.unsigned
      job.status = 'refunded'
    } else {
      const claimId = dispute.claimId || memoryJobs.findClaims(id)[0]?.id
      const claim = claimId ? memoryJobs.findClaims(id).find((c) => c.id === claimId) : undefined
      if (!claim) throw new Error('No claim to release')
      const amount = clampBigint(job.perProofAmount, 0n, job.budget)
      const rel = await rail.release(ctx, { id: job.escrowRef!, rail: rail.name }, {
        to: claim.kolWallet,
        amount,
        from: job.escrowFrom || undefined,
      })
      unsigned = rel.unsigned
      claim.status = 'paid'
      job.status = 'paid'
    }
    memoryJobs.setJob(job)
    res.json({ ok: true, dispute: resolved, resolution, unsigned, resolvedBy: admin })
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'resolve failed' })
  }
})
