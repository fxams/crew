import { Router } from 'express'
import { z } from 'zod'
import { requireAgentApiKey } from '../lib/auth.js'
import { verifyWalletSignature } from '../lib/wallet-auth.js'
import { jobsFeatureEnabled } from '../lib/jobs/config.js'
import {
  contentJobDetailJson,
  expireContentJobIfNeeded,
  fundContentJob,
  isContentJobChainId,
  isXStatusUrl,
  pickContentWinner,
  receiptToJson,
  rejectContentJob,
} from '../lib/jobs/content.js'
import { jobToJson, submissionToJson } from '../lib/jobs/serialize.js'
import { memoryJobs } from '../lib/jobs/store.js'
import { nowMs, parseAmountToBigint, type AssetSymbol, type ChainId } from '../lib/jobs/types.js'

export const contentJobsRouter = Router()

const chainIdSchema = z.enum(['solana-devnet', 'evm:base-sepolia', 'flop-testnet']) as unknown as z.ZodType<ChainId>
const assetSchema = z.enum(['SOL', 'USDC', 'ETH', 'USDT']) as unknown as z.ZodType<AssetSymbol>

const postContentJobSchema = z.object({
  kind: z.enum(['thread', 'meme', 'post']),
  title: z.string().min(3).max(120),
  brief: z.string().min(8).max(20_000),
  chainId: chainIdSchema,
  asset: assetSchema,
  reward: z.number().positive(),
  deadlineMs: z.number().int().positive().optional(),
  deadlineHours: z.number().int().min(1).max(720).optional(),
  fund: z.boolean().optional(),
  rail: z.string().max(32).optional(),
  from: z.string().max(128).optional(),
})

function resolveDeadlineMs(input: { deadlineMs?: number; deadlineHours?: number }): number {
  if (input.deadlineMs && input.deadlineMs > nowMs() + 60_000) return input.deadlineMs
  if (input.deadlineHours && input.deadlineHours > 0) return nowMs() + input.deadlineHours * 60 * 60_000
  throw new Error('Provide deadlineMs (absolute, >1m) or deadlineHours (>0)')
}

function jobsOff(res: import('express').Response): boolean {
  if (jobsFeatureEnabled()) return false
  res.status(404).json({ ok: false, error: 'Content jobs are test/devnet only (JOBS_ENABLED).' })
  return true
}

function buildSubmitMessage(jobId: string, timestamp: number) {
  return `crew-content-submit:${jobId}:${timestamp}`
}

async function requireSubmitWallet(
  req: import('express').Request,
  res: import('express').Response,
  jobId: string,
  chainId: string,
): Promise<string | null> {
  const wallet = (req.header('x-crew-wallet') || '').trim()
  const tsRaw = (req.header('x-crew-timestamp') || '').trim()
  const signature = (req.header('x-crew-signature') || '').trim()
  const timestamp = Number(tsRaw)
  if (chainId.startsWith('solana')) {
    if (!wallet || !tsRaw || !signature || !Number.isFinite(timestamp)) {
      res.status(401).json({ ok: false, error: 'Wallet signature required' })
      return null
    }
    const ok = verifyWalletSignature({
      wallet,
      message: buildSubmitMessage(jobId, timestamp),
      signatureBase58: signature,
    })
    if (!ok) {
      res.status(401).json({ ok: false, error: 'Invalid wallet signature' })
      return null
    }
    return wallet
  }
  if (!wallet) {
    res.status(400).json({ ok: false, error: 'Provide x-crew-wallet' })
    return null
  }
  return wallet
}

contentJobsRouter.post('/jobs/content', requireAgentApiKey, async (req, res) => {
  if (jobsOff(res)) return
  try {
    const body = postContentJobSchema.parse(req.body ?? {})
    if (!isContentJobChainId(body.chainId)) {
      throw new Error('Content jobs are DEVNET only (solana-devnet, evm:base-sepolia, flop-testnet)')
    }
    const reward = parseAmountToBigint(body.reward)
    if (reward <= 0n) throw new Error('reward must be > 0')
    const job = memoryJobs.createContentJob({
      createdBy: req.crewAgentAuth?.keyId || req.crewAgentAuth?.fingerprint || 'unknown',
      title: body.title,
      spec: body.brief,
      contentKind: body.kind,
      chainId: body.chainId,
      asset: body.asset,
      reward,
      deadline: resolveDeadlineMs(body),
    })
    let fundPayload: Awaited<ReturnType<typeof fundContentJob>> | null = null
    if (body.fund) {
      fundPayload = await fundContentJob(job.id, { rail: body.rail, from: body.from })
    }
    res.status(201).json({
      ok: true,
      job: fundPayload?.job || jobToJson(job),
      funding: fundPayload?.funding || null,
      unsigned: fundPayload?.unsigned || null,
      note: 'Paid content job on existing jobs+escrow. Humans submit an X URL + note; the agent picks one winner. Not first-to-claim. DEVNET only. Non-custodial.',
    })
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'create failed' })
  }
})

async function listContentJobsHandler(req: import('express').Request, res: import('express').Response) {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const kindRaw = typeof req.query.kind === 'string' ? req.query.kind : undefined
    const kind = kindRaw === 'thread' || kindRaw === 'meme' || kindRaw === 'post' ? kindRaw : undefined
    const list = memoryJobs.listContentJobs({ status, kind })
    const jobs = []
    for (const j of list) {
      await expireContentJobIfNeeded(j)
      const fresh = memoryJobs.getJob(j.id) || j
      jobs.push({
        ...jobToJson(fresh),
        submissionCount: memoryJobs.listSubmissionsForJob(fresh.id).length,
      })
    }
    res.json({
      ok: true,
      jobs,
      enabled: jobsFeatureEnabled(),
      note: jobsFeatureEnabled()
        ? 'Paid content jobs (thread/meme/post). Agent picks the winner. DEVNET only.'
        : 'JOBS_ENABLED is off — list is empty. Test/devnet only.',
    })
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'list failed' })
  }
}

contentJobsRouter.get('/jobs/content', listContentJobsHandler)
contentJobsRouter.get('/jobs', listContentJobsHandler)

contentJobsRouter.get('/jobs/content/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '')
    const job = memoryJobs.getJob(id)
    if (!job || job.mode !== 'content') {
      res.status(404).json({ ok: false, error: 'Content job not found' })
      return
    }
    await expireContentJobIfNeeded(job)
    const fresh = memoryJobs.getJob(id) || job
    res.json({ ok: true, job: contentJobDetailJson(fresh) })
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'load failed' })
  }
})

contentJobsRouter.post('/jobs/content/:id/submit', async (req, res) => {
  if (jobsOff(res)) return
  try {
    const id = String(req.params.id || '')
    const job = memoryJobs.getJob(id)
    if (!job || job.mode !== 'content') {
      res.status(404).json({ ok: false, error: 'Content job not found' })
      return
    }
    const expired = await expireContentJobIfNeeded(job)
    if (expired.receipt) {
      res.status(400).json({ ok: false, error: 'Job expired' })
      return
    }
    if (job.status === 'created') {
      res.status(400).json({ ok: false, error: 'Job is not funded' })
      return
    }
    if (job.winnerSubmissionId || job.status === 'paid' || job.status === 'refunded' || job.status === 'verified') {
      res.status(400).json({ ok: false, error: 'Job is no longer accepting submissions' })
      return
    }
    const wallet = await requireSubmitWallet(req, res, id, job.chainId)
    if (!wallet) return
    const xUrl = typeof req.body?.xUrl === 'string' ? req.body.xUrl : typeof req.body?.url === 'string' ? req.body.url : ''
    if (!isXStatusUrl(xUrl)) {
      res.status(400).json({ ok: false, error: 'Provide a public https X/Twitter status URL in xUrl' })
      return
    }
    const note = typeof req.body?.note === 'string' ? req.body.note : typeof req.body?.text === 'string' ? req.body.text : ''
    const handle = typeof req.body?.handle === 'string' ? req.body.handle : undefined
    const sub = memoryJobs.submitContentProof(id, { wallet, xUrl, note, handle })
    res.status(201).json({
      ok: true,
      submission: submissionToJson(sub),
      note: 'Submitted. The agent picks a winner — this is not first-to-claim.',
    })
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'submit failed' })
  }
})

contentJobsRouter.post('/jobs/content/:id/pick', requireAgentApiKey, async (req, res) => {
  if (jobsOff(res)) return
  try {
    const id = String(req.params.id || '')
    const job = memoryJobs.getJob(id)
    if (!job || job.mode !== 'content') {
      res.status(404).json({ ok: false, error: 'Content job not found' })
      return
    }
    const submissionId = typeof req.body?.submissionId === 'string' ? req.body.submissionId : ''
    if (!submissionId) {
      res.status(400).json({ ok: false, error: 'Provide submissionId' })
      return
    }
    const from = typeof req.body?.from === 'string' ? req.body.from : undefined
    const out = await pickContentWinner(job, submissionId, { from })
    res.status(201).json({
      ok: true,
      requiresSignature: out.requiresSignature,
      job: jobToJson(out.job),
      submission: submissionToJson(out.submission),
      kolAmount: out.kolAmount,
      platformFee: out.platformFee,
      unsigned: out.unsigned || null,
      txRef: out.txRef || null,
      receipt: receiptToJson(out.receipt),
      tip: out.requiresSignature
        ? 'Non-custodial: sign and submit the unsigned transaction from the agent wallet to pay the winner.'
        : undefined,
    })
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'pick failed' })
  }
})

contentJobsRouter.post('/jobs/content/:id/reject', requireAgentApiKey, async (req, res) => {
  if (jobsOff(res)) return
  try {
    const id = String(req.params.id || '')
    const job = memoryJobs.getJob(id)
    if (!job || job.mode !== 'content') {
      res.status(404).json({ ok: false, error: 'Content job not found' })
      return
    }
    const from = typeof req.body?.from === 'string' ? req.body.from : undefined
    const to = typeof req.body?.to === 'string' ? req.body.to : undefined
    const expired = await expireContentJobIfNeeded(job, { from, to })
    if (expired.receipt) {
      res.json({
        ok: true,
        job: jobToJson(expired.job),
        receipt: receiptToJson(expired.receipt),
        unsigned: expired.unsigned || null,
        txRef: expired.txRef || null,
        note: 'Deadline passed with no winner — refunded to the agent.',
      })
      return
    }
    const out = await rejectContentJob(job, { from, to })
    res.json({
      ok: true,
      job: jobToJson(out.job),
      receipt: receiptToJson(out.receipt),
      unsigned: out.unsigned || null,
      txRef: out.txRef || null,
      note: 'Rejected with no winner — reward refunded to the agent.',
    })
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'reject failed' })
  }
})
