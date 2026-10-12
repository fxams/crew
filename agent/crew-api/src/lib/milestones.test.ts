import { describe, expect, it } from 'vitest'
import { buildLaunchMilestones } from './milestones.js'
import { fundedAtProgress } from './kickoff.js'

const mint = 'So11111111111111111111111111111111111111112'

describe('launch milestone timeline', () => {
  it('orders Featured on @CrewPayHQ immediately after Graduated and locks it until graduation', () => {
    const steps = buildLaunchMilestones({
      coin: {
        mint,
        launchedAt: 1_700_000_000_000,
        signature: 'LaunchSig111',
        feeShareSignature: 'FeeSig111',
        crew: [{ handle: 'owl', wallet: 'W', share: 60 }],
        platform: 'pumpfun',
        pumpUrl: `https://pump.fun/coin/${mint}`,
      },
      firstAiAt: 1_700_000_100_000,
      dexscreener: {
        met: false,
        volumeUsd: 10,
        marketCapSol: 12,
        minVolumeUsd: 100_000,
        minMcapSol: 1000,
        reasons: ['need volume'],
      },
      extras: [
        {
          id: 'dexscreener',
          label: 'Dexscreener Enhanced Token Info',
          summary: '',
          costUsd: 299,
          costSol: 3,
          included: false,
          priceMayChange: true,
          costNote: '',
          eligible: false,
          state: 'waiting-traction',
          fundedAt: fundedAtProgress(299, 25),
        },
      ],
    })
    const ids = steps.map((s) => s.id)
    expect(ids.indexOf('featured-crewpayhq')).toBe(ids.indexOf('graduated') + 1)
    expect(steps.find((s) => s.id === 'graduated')?.status).toBe('locked')
    expect(steps.find((s) => s.id === 'featured-crewpayhq')).toMatchObject({
      status: 'locked',
      label: 'Featured on @CrewPayHQ',
    })
    expect(steps.find((s) => s.id === 'featured-crewpayhq')?.detail).toMatch(/does not auto-post/)
    expect(steps.find((s) => s.id === 'launched')?.status).toBe('done')
    expect(steps.find((s) => s.id === 'launched')?.tx).toBe('LaunchSig111')
    expect(steps.find((s) => s.id === 'dexscreener-funded')?.fundedAt?.progress).toBeCloseTo(25 / 299)
  })

  it('marks featured done only when a stored post URL exists after graduation', () => {
    const locked = buildLaunchMilestones({
      coin: {
        mint,
        launchedAt: 1,
        signature: 's',
        crew: [],
        platform: 'pumpfun',
        pumpUrl: 'https://pump.fun/coin/x',
        graduatedAt: 2,
        graduatedVia: 'pumpswap',
      },
    })
    expect(locked.find((s) => s.id === 'graduated')?.status).toBe('done')
    expect(locked.find((s) => s.id === 'featured-crewpayhq')?.status).toBe('in-progress')
    expect(locked.find((s) => s.id === 'featured-crewpayhq')?.href).toBe('https://x.com/CrewPayHQ')

    const done = buildLaunchMilestones({
      coin: {
        mint,
        launchedAt: 1,
        signature: 's',
        crew: [],
        platform: 'pumpfun',
        pumpUrl: 'https://pump.fun/coin/x',
        graduatedAt: 2,
        featuredXUrl: 'https://x.com/CrewPayHQ/status/99',
        featuredXAt: 3,
      },
    })
    const feat = done.find((s) => s.id === 'featured-crewpayhq')
    expect(feat?.status).toBe('done')
    expect(feat?.href).toBe('https://x.com/CrewPayHQ/status/99')
    expect(feat?.at).toBe(3)
  })

  it('omits Pump graduation + featured on Bags/Zora', () => {
    const steps = buildLaunchMilestones({
      coin: {
        mint: '0xabc',
        launchedAt: 1,
        signature: '0xsig',
        crew: [],
        platform: 'zora',
        pumpUrl: 'https://zora.co/coin/base:0xabc',
      },
    })
    expect(steps.map((s) => s.id)).not.toContain('graduated')
    expect(steps.map((s) => s.id)).not.toContain('featured-crewpayhq')
  })
})
