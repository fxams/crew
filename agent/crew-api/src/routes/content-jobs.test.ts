import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import nacl from 'tweetnacl'
import bs58 from 'bs58'
import { createApiApp } from '../api-app.js'
import { memoryJobs } from '../lib/jobs/store.js'

function signSubmit(jobId: string) {
  const kp = nacl.sign.keyPair()
  const wallet = bs58.encode(kp.publicKey)
  const timestamp = Date.now()
  const msg = `crew-content-submit:${jobId}:${timestamp}`
  const sig = nacl.sign.detached(new TextEncoder().encode(msg), kp.secretKey)
  return {
    wallet,
    headers: {
      'x-crew-wallet': wallet,
      'x-crew-timestamp': String(timestamp),
      'x-crew-signature': bs58.encode(sig),
    },
  }
}

describe('content jobs HTTP', () => {
  const prevEnabled = process.env.JOBS_ENABLED
  const prevRail = process.env.JOBS_RAIL
  const prevAgent = process.env.CREW_AGENT_API_KEY
  const prevBoard = process.env.CREW_API_KEY

  beforeEach(() => {
    memoryJobs.clearAll()
    process.env.JOBS_ENABLED = 'true'
    process.env.JOBS_RAIL = 'sim'
    delete process.env.CREW_AGENT_API_KEY
    delete process.env.CREW_API_KEY
  })

  afterEach(() => {
    process.env.JOBS_ENABLED = prevEnabled
    process.env.JOBS_RAIL = prevRail
    if (prevAgent === undefined) delete process.env.CREW_AGENT_API_KEY
    else process.env.CREW_AGENT_API_KEY = prevAgent
    if (prevBoard === undefined) delete process.env.CREW_API_KEY
    else process.env.CREW_API_KEY = prevBoard
    memoryJobs.clearAll()
  })

  it('posts a brief, accepts two proofs, picks the second, records a receipt', async () => {
    const app = createApiApp()
    const created = await request(app)
      .post('/api/jobs/content')
      .send({
        kind: 'meme',
        title: 'Launch meme',
        brief: 'Post an original meme quoting the ticker.',
        chainId: 'solana-devnet',
        asset: 'SOL',
        reward: 1,
        deadlineHours: 24,
        fund: true,
      })
    expect(created.status).toBe(201)
    expect(created.body.job.mode).toBe('content')
    expect(created.body.job.status).toBe('funded')
    const jobId = created.body.job.id as string

    const a = signSubmit(jobId)
    const first = await request(app)
      .post(`/api/jobs/content/${jobId}/submit`)
      .set(a.headers)
      .send({ xUrl: 'https://x.com/a/status/111', note: 'first meme' })
    expect(first.status).toBe(201)

    const b = signSubmit(jobId)
    const second = await request(app)
      .post(`/api/jobs/content/${jobId}/submit`)
      .set(b.headers)
      .send({ xUrl: 'https://x.com/b/status/222', note: 'better meme' })
    expect(second.status).toBe(201)

    const listed = await request(app).get('/api/jobs')
    expect(listed.status).toBe(200)
    expect(listed.body.jobs).toHaveLength(1)
    expect(listed.body.jobs[0].submissionCount).toBe(2)

    const pick = await request(app)
      .post(`/api/jobs/content/${jobId}/pick`)
      .send({ submissionId: second.body.submission.id })
    expect(pick.status).toBe(201)
    expect(pick.body.submission.wallet).toBe(b.wallet)
    expect(pick.body.receipt.kind).toBe('content-payout')
    expect(pick.body.receipt.xUrl).toBe('https://x.com/b/status/222')

    const detail = await request(app).get(`/api/jobs/content/${jobId}`)
    expect(detail.body.job.winnerSubmissionId).toBe(second.body.submission.id)
    expect(detail.body.job.submissions).toHaveLength(2)
  })

  it('rejects mainnet chain ids', async () => {
    const app = createApiApp()
    const res = await request(app)
      .post('/api/jobs/content')
      .send({
        kind: 'post',
        title: 'Mainnet no',
        brief: 'Should not land on mainnet.',
        chainId: 'solana',
        asset: 'SOL',
        reward: 1,
        deadlineHours: 12,
      })
    expect(res.status).toBe(400)
  })

  it('rejects a non-X URL', async () => {
    const app = createApiApp()
    const created = await request(app)
      .post('/api/jobs/content')
      .send({
        kind: 'post',
        title: 'Need an X url',
        brief: 'Proof must be an X status.',
        chainId: 'solana-devnet',
        asset: 'SOL',
        reward: 1,
        deadlineHours: 12,
        fund: true,
      })
    const jobId = created.body.job.id as string
    const signed = signSubmit(jobId)
    const res = await request(app)
      .post(`/api/jobs/content/${jobId}/submit`)
      .set(signed.headers)
      .send({ xUrl: 'https://example.com/post/1', note: 'nope' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/X\/Twitter/i)
  })
})
