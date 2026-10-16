import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dryRunLaunchForAgent } from './launch.js'

const EVM_LAUNCHER = '0x1111111111111111111111111111111111111111'
const EVM_CREW = '0x2222222222222222222222222222222222222222'
const TREAS = '0x3333333333333333333333333333333333333333'
const PNG_B64 = Buffer.from(
  Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(64).fill(0)]),
).toString('base64')

vi.mock('../registered-hires.js', () => ({
  listRegisteredHireBoosts: vi.fn(async () => [
    {
      handle: 'alice',
      wallet: 'So11111111111111111111111111111111111111112',
      evmWallet: EVM_CREW,
      followers: 500,
      registeredAt: Date.now(),
    },
  ]),
}))

beforeEach(() => {
  process.env.CLANKER_ENABLED = '1'
  process.env.CLANKER_CHAIN = 'base-sepolia'
  process.env.CLANKER_TREASURY_ADDRESS = TREAS
})

afterEach(() => {
  delete process.env.CLANKER_ENABLED
  delete process.env.CLANKER_CHAIN
  delete process.env.CLANKER_TREASURY_ADDRESS
  vi.clearAllMocks()
})

describe('dryRunLaunchForAgent EVM', () => {
  it('accepts explicit 0x crew on platform=clanker', async () => {
    const plan = await dryRunLaunchForAgent(
      {
        name: 'CPTEST',
        ticker: 'CPTEST',
        description: 'base sepolia clanker',
        mode: 'agent',
        image: { kind: 'base64', data: PNG_B64, contentType: 'image/png' },
        crew: [{ handle: '@alice', wallet: EVM_CREW, share: 100, hireRole: 'kol' }],
        agent: { name: 'Bot', objective: 'Test Clanker dry-run on Base Sepolia', model: 'api' },
      },
      { launcherPubkey: EVM_LAUNCHER, platform: 'clanker' },
    )
    expect(plan.ok).toBe(true)
    expect(plan.cluster).toBe('base-sepolia')
    expect(plan.crew[0]?.wallet).toBe(EVM_CREW)
    expect(plan.shareholders?.some((s) => s.wallet.toLowerCase() === TREAS.toLowerCase())).toBe(true)
  })

  it('autohires with EVM launcher without Solana base58 errors', async () => {
    const plan = await dryRunLaunchForAgent(
      {
        name: 'CPTEST',
        ticker: 'CPTEST',
        description: 'clanker autohire',
        mode: 'agent',
        image: { kind: 'base64', data: PNG_B64, contentType: 'image/png' },
        autoHire: { seats: 1 },
        agent: { name: 'Bot', objective: 'Autohire EVM crew for Clanker test', model: 'api' },
      },
      { launcherPubkey: EVM_LAUNCHER, platform: 'clanker' },
    )
    expect(plan.ok).toBe(true)
    expect(plan.crew[0]?.wallet.toLowerCase()).toBe(EVM_CREW)
    expect(plan.sufficient).toBe(true)
  })
})
