import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dryRunLaunchForAgent, launchNextSteps } from './launch.js'

const PLATFORM = 'So11111111111111111111111111111111111111112'
/** PNG magic + padding (≥64 bytes) — enough for sniffImageType. */
const PNG_B64 = Buffer.from(
  Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(64).fill(0)]),
).toString('base64')
/** SVG padded to ≥64 decoded bytes — must be rejected (same as real launch). */
const SVG_B64 = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1"/></svg><!-- pad -->',
  'utf8',
).toString('base64')

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
      image: { kind: 'base64', data: PNG_B64, contentType: 'image/png' },
      autoHire: { seats: 3 },
      agent: { name: 'DeskBot', objective: 'Hire KOLs and grow DCAT on CREW', model: 'claude' },
    })
    expect(plan.ok).toBe(true)
    expect(plan.dryRun).toBe(true)
    expect(plan.cluster).toBe('mainnet-beta')
    expect(plan.crew.length).toBeGreaterThan(0)
    expect(plan.costs.needSol).toBeGreaterThan(0)
    expect(plan.disclaimer.toLowerCase()).toContain('not consent')
    expect(plan.attribution).toContain('CrewPay.dev')
    expect(plan.vibe).toContain('Launched from CrewPay.dev platform')
    expect(plan.image?.contentType).toBe('image/png')
    expect(plan.nextSteps.some((s) => /own wallet|CREW_LAUNCHER|REST/i.test(s))).toBe(true)
    expect(plan.sufficient).toBeNull()
    expect(plan.hirePlan).toBeTruthy()
    expect(plan.crew.every((m) => typeof m.effectiveBps === 'number')).toBe(true)
    expect(plan.shareholders?.some((s) => s.role === 'buyback')).toBe(true)
  })

  it('returns hirePlan null and top-level sufficient for explicit crew', async () => {
    const plan = await dryRunLaunchForAgent(
      {
        name: 'Desk Cat',
        ticker: 'DCAT',
        description: 'ai agent trench meme',
        mode: 'agent',
        image: { kind: 'base64', data: PNG_B64, contentType: 'image/png' },
        crew: [
          {
            handle: '@alice',
            wallet: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
            share: 100,
            hireRole: 'kol',
          },
        ],
        agent: { name: 'DeskBot', objective: 'Hire KOLs and grow DCAT on CREW', model: 'claude' },
      },
      { launcherPubkey: PLATFORM },
    )
    expect(plan.hirePlan).toBeNull()
    expect(plan.sufficient).toBe(true)
    expect(typeof plan.crew[0]?.effectiveBps).toBe('number')
  })

  it('rejects SVG images like a real launch would', async () => {
    await expect(
      dryRunLaunchForAgent({
        name: 'Desk Cat',
        ticker: 'DCAT',
        description: 'ai agent trench meme',
        mode: 'agent',
        image: { kind: 'base64', data: SVG_B64, contentType: 'image/svg+xml' },
        autoHire: { seats: 3 },
        agent: { name: 'DeskBot', objective: 'Hire KOLs and grow DCAT on CREW' },
      }),
    ).rejects.toThrow(/PNG\/JPEG\/WebP\/GIF|not a PNG/i)
  })

  it('rejects user descriptions that leave no room for attribution', async () => {
    await expect(
      dryRunLaunchForAgent({
        name: 'Desk Cat',
        ticker: 'DCAT',
        description: 'x'.repeat(240),
        mode: 'agent',
        image: { kind: 'base64', data: PNG_B64 },
        autoHire: { seats: 3 },
        agent: { name: 'DeskBot', objective: 'Hire KOLs and grow DCAT on CREW' },
      }),
    ).rejects.toThrow(/Description max 204/i)
  })

  it('rejects crew shares that do not total 100%', async () => {
    await expect(
      dryRunLaunchForAgent({
        name: 'Desk Cat',
        ticker: 'DCAT',
        description: 'ai agent trench meme',
        mode: 'agent',
        image: { kind: 'base64', data: PNG_B64 },
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
      hirePlan: null,
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
