import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApiApp } from '../api-app.js'
import { resetSharedFlopRail } from '../lib/jobs/flop-rail.js'
import { memoryJobs } from '../lib/jobs/store.js'
import { parseAmountToBigint, parseAssetAmount } from '../lib/jobs/types.js'

const PAYEE = '5FjCGp7SM7QB7ZsysTR4pTFVd2oY4KGbRAV48h4nWavoPtV6'
const FUNDER = '5DRhi7dvWicmgUPfKpxdV5p4kxXiQUbLUFXtwp4EcAWLtu4D'

describe('jobs HTTP flop-devnet / FLOP', () => {
  const prev = {
    JOBS_ENABLED: process.env.JOBS_ENABLED,
    JOBS_RAIL: process.env.JOBS_RAIL,
    FLOP_ENABLED: process.env.FLOP_ENABLED,
    FLOP_RAIL: process.env.FLOP_RAIL,
    FLOP_RPC_URL: process.env.FLOP_RPC_URL,
    FLOP_CHAIN_ID: process.env.FLOP_CHAIN_ID,
    CREW_AGENT_API_KEY: process.env.CREW_AGENT_API_KEY,
    CREW_API_KEY: process.env.CREW_API_KEY,
  }

  beforeEach(() => {
    memoryJobs.clearAll()
    resetSharedFlopRail()
    process.env.JOBS_ENABLED = 'true'
    delete process.env.JOBS_RAIL
    process.env.FLOP_ENABLED = 'true'
    delete process.env.FLOP_RAIL
    delete process.env.FLOP_RPC_URL
    process.env.FLOP_CHAIN_ID = 'flop-devnet'
    delete process.env.CREW_AGENT_API_KEY
    delete process.env.CREW_API_KEY
  })

  afterEach(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    resetSharedFlopRail()
    memoryJobs.clearAll()
  })

  it('parses FLOP display units as 18-decimal Planck', () => {
    expect(parseAssetAmount(1, 'FLOP')).toBe(10n ** 18n)
    expect(parseAssetAmount(0.5, 'FLOP')).toBe(5n * 10n ** 17n)
    expect(parseAmountToBigint(1)).toBe(1_000_000_000n)
  })

  it('accepts flop-devnet + FLOP on create and dry-run', async () => {
    const app = createApiApp()
    const dry = await request(app).post('/api/jobs/campaigns/dry-run').send({
      type: 'content',
      chainId: 'flop-devnet',
      asset: 'FLOP',
      budget: 1,
      perProofAmount: 0.5,
      maxProofs: 2,
      deadlineHours: 24,
    })
    expect(dry.status).toBe(200)
    expect(dry.body.plan.chainId).toBe('flop-devnet')
    expect(dry.body.plan.asset).toBe('FLOP')
    expect(dry.body.plan.budget).toBe(1)

    const created = await request(app).post('/api/jobs/campaigns').send({
      type: 'content',
      chainId: 'flop-devnet',
      asset: 'FLOP',
      budget: 1,
      perProofAmount: 0.5,
      maxProofs: 2,
      deadlineHours: 24,
    })
    expect(created.status).toBe(201)
    expect(created.body.job.chainId).toBe('flop-devnet')
    expect(created.body.job.asset).toBe('FLOP')
    expect(created.body.job.budget).toBe(1)
  })

  it('rejects fund on flop-devnet without a payee', async () => {
    const app = createApiApp()
    const created = await request(app).post('/api/jobs/campaigns').send({
      chainId: 'flop-devnet',
      asset: 'FLOP',
      budget: 1,
      perProofAmount: 0.5,
      maxProofs: 2,
      deadlineHours: 24,
    })
    const id = created.body.job.id as string
    const funded = await request(app).post(`/api/jobs/${id}/fund`).send({
      rail: 'flop-tclk',
      from: FUNDER,
    })
    expect(funded.status).toBe(400)
    expect(funded.body.error).toMatch(/body\.to/)
  })

  it('passes payee to rail.fund and returns unsigned', async () => {
    const app = createApiApp()
    const created = await request(app).post('/api/jobs/campaigns').send({
      chainId: 'flop-devnet',
      asset: 'FLOP',
      budget: 1,
      perProofAmount: 0.5,
      maxProofs: 2,
      deadlineHours: 24,
    })
    const id = created.body.job.id as string
    const funded = await request(app).post(`/api/jobs/${id}/fund`).send({
      rail: 'flop-tclk',
      from: FUNDER,
      to: PAYEE,
    })
    expect(funded.status).toBe(201)
    expect(funded.body.job.escrowTo).toBe(PAYEE)
    expect(funded.body.job.escrowFrom).toBe(FUNDER)
    expect(funded.body.unsigned).toBeTruthy()
    expect(funded.body.locked.unsigned).toEqual(funded.body.unsigned)
    expect(JSON.stringify(funded.body)).not.toMatch(/preimage/i)
  })
})
