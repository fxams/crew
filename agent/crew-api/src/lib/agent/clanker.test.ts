import { afterEach, describe, expect, it } from 'vitest'
import {
  CLANKER_PROTOCOL_FEE_GAP,
  buildClankerUnsignedLaunch,
  resolveClankerCrewWallets,
  setClankerDeployCallForTests,
  setClankerEvmRpcForTests,
} from './clanker.js'

const agent = '0x1111111111111111111111111111111111111111'
const kol = '0x2222222222222222222222222222222222222222'
const treas = '0x3333333333333333333333333333333333333333'
const coin = '0x5555555555555555555555555555555555555555'
const factory = '0x6666666666666666666666666666666666666666'

afterEach(() => {
  setClankerDeployCallForTests(null)
  setClankerEvmRpcForTests(null)
  delete process.env.CLANKER_ENABLED
  delete process.env.CLANKER_CHAIN
  delete process.env.ZORA_TREASURY_ADDRESS
})

describe('Clanker unsigned launch', () => {
  it('maps crew to reward recipients at 60/15/25 bps', async () => {
    process.env.CLANKER_ENABLED = '1'
    process.env.CLANKER_CHAIN = 'base-sepolia'
    process.env.ZORA_TREASURY_ADDRESS = treas
    let captured: Record<string, unknown> | null = null
    setClankerDeployCallForTests(async (token) => {
      captured = token
      return {
        address: factory,
        data: '0xdeploydata',
        value: 0n,
        predictedToken: coin,
      }
    })
    setClankerEvmRpcForTests(async (method) => {
      if (method === 'eth_getTransactionCount') return '0x2'
      if (method === 'eth_getBlockByNumber') return { baseFeePerGas: '0x3b9aca00' }
      if (method === 'eth_maxPriorityFeePerGas') return '0x3b9aca00'
      if (method === 'eth_estimateGas') return '0x30d40'
      return '0x0'
    })

    const plan = await buildClankerUnsignedLaunch({
      name: 'Desk Cat',
      ticker: 'DCAT',
      metadataUri: 'ipfs://bafytest',
      launcherPubkey: agent,
      shareholders: [
        { wallet: kol, bps: 6000, role: 'crew' },
        { wallet: agent, bps: 1500, role: 'desk' },
        { wallet: treas, bps: 2500, role: 'platform' },
      ],
    })

    expect(plan.platform).toBe('clanker')
    expect(plan.encoding).toBe('eip1559')
    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0]?.kind).toBe('clanker_deploy')
    expect(plan.steps[0]?.tx?.chainId).toBe(84532)
    expect(plan.mint.toLowerCase()).toBe(coin)
    expect(plan.pumpUrl).toContain('sepolia.basescan.org')
    expect(plan.pumpUrl).toContain('#clanker')
    const rewards = (captured as { rewards?: { recipients: Array<{ recipient: string; bps: number }> } })
      ?.rewards?.recipients
    expect(rewards?.find((r) => r.recipient.toLowerCase() === kol)?.bps).toBe(6000)
    expect(rewards?.find((r) => r.recipient.toLowerCase() === agent)?.bps).toBe(1500)
    expect(rewards?.find((r) => r.recipient.toLowerCase() === treas)?.bps).toBe(2500)
    expect(plan.warnings?.join(' ')).toContain(CLANKER_PROTOCOL_FEE_GAP.slice(0, 40))
    expect(resolveClankerCrewWallets([{ handle: '@a', wallet: kol, share: 100, hireRole: 'kol' }])[0]?.wallet).toBe(
      kol,
    )
  })

  it('stays off without CLANKER_ENABLED', async () => {
    await expect(
      buildClankerUnsignedLaunch({
        name: 'X',
        ticker: 'XXX',
        metadataUri: 'ipfs://x',
        launcherPubkey: agent,
        shareholders: [{ wallet: agent, bps: 10_000, role: 'desk' }],
      }),
    ).rejects.toThrow(/CLANKER_ENABLED/)
  })
})
