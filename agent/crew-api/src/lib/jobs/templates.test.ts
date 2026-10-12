import { describe, expect, it } from 'vitest'
import { memoryJobs } from './store.js'
import { SimulatedSettlementRail } from './settlement.js'
import { defaultVerifier } from './verifier.js'
import { parseAmountToBigint } from './types.js'
import {
  applyCoinJobTemplate,
  COIN_JOB_TEMPLATES,
  getCoinJobTemplate,
  isCoinJobChainId,
  listCoinJobTemplates,
} from './templates.js'

const MINT = 'So11111111111111111111111111111111111111112'

describe('coin job templates', () => {
  it('exposes the four creative presets', () => {
    expect(COIN_JOB_TEMPLATES.map((t) => t.id)).toEqual([
      'meme-pack',
      'banner-logo',
      'x-upkeep',
      'website-polish',
    ])
    expect(listCoinJobTemplates().every((t) => t.note.includes('No earnings promises'))).toBe(true)
    expect(getCoinJobTemplate('meme-pack').type).toBe('content')
    expect(getCoinJobTemplate('banner-logo').type).toBe('design')
    expect(getCoinJobTemplate('x-upkeep').type).toBe('community')
    expect(getCoinJobTemplate('website-polish').type).toBe('design')
  })

  it('rejects mainnet chain ids', () => {
    expect(isCoinJobChainId('solana')).toBe(false)
    expect(isCoinJobChainId('evm:base')).toBe(false)
    expect(isCoinJobChainId('solana-devnet')).toBe(true)
    expect(() =>
      applyCoinJobTemplate({
        template: 'meme-pack',
        mint: MINT,
        chainId: 'solana',
        asset: 'SOL',
      }),
    ).toThrow(/test\/devnet only/)
  })

  it('sizes x-upkeep from posts-per-week', () => {
    const plan = applyCoinJobTemplate({
      template: 'x-upkeep',
      mint: MINT,
      ticker: 'HOOT',
      pageUrl: 'https://crewpay.dev/coin/' + MINT,
      postsPerWeek: 3,
      deadlineHours: 168,
      chainId: 'solana-devnet',
      asset: 'SOL',
    })
    expect(plan.type).toBe('community')
    expect(plan.maxProofs).toBe(3)
    expect(plan.rules.postsPerWeek).toBe(3)
    expect(plan.rules.deliverableKind).toBe('x-upkeep')
    expect(plan.rules.requiredTicker).toBe('HOOT')
    expect(plan.rules.platform).toBe('x')
    expect(plan.budget).toBeCloseTo(plan.perProofAmount * plan.maxProofs)
  })

  it('does not require ticker in meme-pack URLs', () => {
    const plan = applyCoinJobTemplate({
      template: 'meme-pack',
      mint: MINT,
      ticker: 'HOOT',
      chainId: 'solana-devnet',
      asset: 'SOL',
    })
    expect(plan.rules.requiredTicker).toBeUndefined()
    expect(plan.rules.minUrls).toBe(4)
    expect(plan.rules.platform).toBe('any')
  })
})

describe('creative job lifecycle on sim rail', () => {
  it('meme pack: create → fund → claim → submit → verify → payout', async () => {
    memoryJobs.clearAll()
    const plan = applyCoinJobTemplate({
      template: 'meme-pack',
      mint: MINT,
      chainId: 'solana-devnet',
      asset: 'SOL',
    })
    const job = memoryJobs.createCampaign({
      createdBy: 'crew_ak_test',
      chainId: plan.chainId,
      asset: plan.asset,
      budget: parseAmountToBigint(plan.budget),
      perProofAmount: parseAmountToBigint(plan.perProofAmount),
      maxProofs: plan.maxProofs,
      perKOLCap: plan.perKOLCap,
      deadline: Date.now() + plan.deadlineHours * 3600_000,
      rules: plan.rules,
      type: plan.type,
      mint: plan.mint,
      templateId: plan.templateId,
    })
    expect(job.mint).toBe(MINT)
    expect(job.templateId).toBe('meme-pack')

    const rail = new SimulatedSettlementRail()
    const { escrow } = await rail.fund({ chainId: job.chainId, asset: job.asset }, { amount: job.budget })
    job.escrowRef = escrow.id
    job.status = 'funded'
    memoryJobs.setJob(job)

    const claim = memoryJobs.claimJob(job.id, 'KolWallet1111111111111111111111111111111', job.chainId, 'owl')
    const urls = [
      'https://ipfs.io/ipfs/bafy1',
      'https://ipfs.io/ipfs/bafy2',
      'https://imgur.com/a/pack3',
      'https://imgur.com/a/pack4',
    ]
    const sub = memoryJobs.submit(claim.id, urls)
    const v = await defaultVerifier(job.rules.deliverableKind).verify({
      platform: 'any',
      urls: sub.urls,
      minUrls: job.rules.minUrls,
      deliverableKind: job.rules.deliverableKind,
    })
    expect(v.ok).toBe(true)
    expect(v.acceptedUrls?.length).toBe(4)

    const amount = job.perProofAmount * BigInt(v.acceptedUrls!.length)
    const rel = await rail.release(
      { chainId: job.chainId, asset: job.asset },
      { id: job.escrowRef!, rail: 'sim' },
      { to: claim.kolWallet, amount: amount > job.budget ? job.budget : amount },
    )
    expect(rel.txRef).toMatch(/sim-release:/)
    expect(memoryJobs.listOpen(MINT).some((j) => j.id === job.id)).toBe(true)
  })
})
