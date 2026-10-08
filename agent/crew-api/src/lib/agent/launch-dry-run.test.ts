import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dryRunLaunchForAgent, launchNextSteps } from './launch.js'

const PLATFORM = 'So11111111111111111111111111111111111111112'

beforeEach(() => {
  vi.stubEnv('CREW_BUYBACK_WALLET', PLATFORM)
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('dryRunLaunchForAgent', () => {
  it('plans autohire without creating a mint', async () => {
    const plan = await dryRunLaunchForAgent({
      name: 'Desk Cat',
      ticker: 'DCAT',
      description: 'ai agent trench meme',
      mode: 'agent',
      image: { kind: 'url', url: 'https://example.com/cat.png' },
      autoHire: { seats: 3 },
      agent: { name: 'DeskBot', objective: 'Hire KOLs and grow DCAT on CREW', model: 'claude' },
    })
    expect(plan.ok).toBe(true)
    expect(plan.dryRun).toBe(true)
    expect(plan.cluster).toBe('mainnet-beta')
    expect(plan.crew.length).toBeGreaterThan(0)
    expect(plan.costs.needSol).toBeGreaterThan(0)
    expect(plan.disclaimer.toLowerCase()).toContain('not consent')
    expect(plan.nextSteps.some((s) => s.includes('dry') || s.includes('CREW_LAUNCHER'))).toBe(true)
  })

  it('rejects crew shares that do not total 100%', async () => {
    await expect(
      dryRunLaunchForAgent({
        name: 'Desk Cat',
        ticker: 'DCAT',
        description: 'ai agent trench meme',
        mode: 'agent',
        image: { kind: 'url', url: 'https://example.com/cat.png' },
        crew: [
          {
            handle: '@alice',
            wallet: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
            share: 60,
            hireRole: 'kol',
          },
        ],
        agent: { name: 'DeskBot', objective: 'Hire KOLs and grow DCAT on CREW' },
      }),
    ).rejects.toThrow(/total 100%/)
  })
})

describe('launchNextSteps', () => {
  it('points partial launches at wire-fees', () => {
    const steps = launchNextSteps({
      ok: true,
      mint: 'x',
      signature: 'y',
      feeShareLocked: false,
      pumpUrl: 'https://pump.fun/coin/x',
      launcher: PLATFORM,
      crew: [],
      mode: 'agent',
      coin: {
        id: 'c',
        mint: 'x',
        name: 'n',
        ticker: 'T',
        vibe: 'v',
        mode: 'agent',
        crew: [],
        signature: 'y',
        launchedAt: 1,
        launcher: PLATFORM,
        pumpUrl: 'https://pump.fun/coin/x',
        holderKol: false,
      },
    })
    expect(steps.join(' ')).toMatch(/wire/i)
  })
})
