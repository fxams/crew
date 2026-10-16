import { afterEach, describe, expect, it } from 'vitest'
import { slice } from 'viem'
import { VIBEVIBE_FACTORY_CREATE_SELECTOR } from './vibevibe-abi.js'
import {
  VIBEVIBE_FEE_SPLIT_GAP,
  buildVibevibeUnsignedLaunch,
  encodeVibevibeCreateCalldata,
  resolveVibevibeCreatorFeeRecipient,
  setVibevibeCreateEncoderForTests,
  setVibevibeEvmRpcForTests,
} from './vibevibe.js'

const agent = '0x1111111111111111111111111111111111111111'
const kol = '0x2222222222222222222222222222222222222222'
const treas = '0x3333333333333333333333333333333333333333'
const refLauncher = '0x273bf8e19f3a1234ca060e07bf247f0ff6bed60c'

const REF_TX_INPUT =
  '0x24e615b3000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000001e0000000000000000000000000000000000000000000000000000000000000022000000000000000000000000000000000000000000000000000000000000002600000000000000000000000000000000000000000000000000000000000000064000000000000000000000000000000000000000000000000000001f41d4c07d0000000000000000000000000273bf8e19f3a1234ca060e07bf247f0ff6bed60c0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006ad21a0f0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c4372657750617920546573740000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000643505445535400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000042697066733a2f2f6261666b726569646736366a7670767a3667666f6377336c68786471717778626d72647a64797077356d786b7a6a626f7076627076687961746161000000000000000000000000000000000000000000000000000000000000'

afterEach(() => {
  setVibevibeCreateEncoderForTests(null)
  setVibevibeEvmRpcForTests(null)
  delete process.env.VIBEVIBE_ENABLED
  delete process.env.VIBEVIBE_CHAIN
  delete process.env.VIBEVIBE_FEE_SPLITTER_ADDRESS
  delete process.env.VIBEVIBE_TREASURY_ADDRESS
  delete process.env.CLANKER_TREASURY_ADDRESS
})

describe('vibe/vibe encode', () => {
  it('matches reference tx calldata body (run15 factory)', () => {
    const fixed = encodeVibevibeCreateCalldata({
      name: 'CrewPay Test',
      symbol: 'CPTEST',
      metadataURI: 'ipfs://bafkreidg66jvpvz6gfocw3lhxdqqwxbmrdzdypw5mxkzjbopvbpvhyataa',
      metadataSchemaVersion: 100n,
      minInitialTokensOut: 2147975170000n,
      creatorFeeRecipient: refLauncher,
      deadline: 1792154127n,
    })
    expect(fixed.startsWith(VIBEVIBE_FACTORY_CREATE_SELECTOR)).toBe(true)
    expect(slice(fixed, 4)).toEqual(slice(REF_TX_INPUT as `0x${string}`, 4))
  })
})

describe('vibe/vibe unsigned launch', () => {
  it('builds EIP-1559 deploy with fee-split warning', async () => {
    process.env.VIBEVIBE_ENABLED = '1'
    process.env.CLANKER_TREASURY_ADDRESS = treas
    setVibevibeEvmRpcForTests(async (method) => {
      if (method === 'eth_getTransactionCount') return '0x1'
      if (method === 'eth_getBlockByNumber') return { baseFeePerGas: '0x3b9aca00' }
      if (method === 'eth_maxPriorityFeePerGas') return '0x3b9aca00'
      if (method === 'eth_estimateGas') return '0x30d40'
      if (method === 'eth_call') return '0x0000000000000000000000000000000000000000000000000005af3107a4000'
      return '0x0'
    })

    const plan = await buildVibevibeUnsignedLaunch({
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

    expect(plan.platform).toBe('vibevibe')
    expect(plan.encoding).toBe('eip1559')
    expect(plan.steps[0]?.kind).toBe('vibevibe_deploy')
    expect(plan.steps[0]?.tx?.chainId).toBe(46630)
    expect(plan.pumpUrl).toContain('testnet.vibevibe.fun')
    expect(
      resolveVibevibeCreatorFeeRecipient(agent, [
        { wallet: kol, bps: 6000, role: 'crew' },
      ]),
    ).toBe(agent)
    expect(plan.warnings?.join(' ')).toContain(VIBEVIBE_FEE_SPLIT_GAP.slice(0, 40))
  })

  it('uses VIBEVIBE_FEE_SPLITTER_ADDRESS as creatorFeeRecipient when set', () => {
    const splitter = '0x4444444444444444444444444444444444444444'
    process.env.VIBEVIBE_FEE_SPLITTER_ADDRESS = splitter
    expect(resolveVibevibeCreatorFeeRecipient(agent, [])).toBe(splitter)
  })

  it('stays off without VIBEVIBE_ENABLED', async () => {
    await expect(
      buildVibevibeUnsignedLaunch({
        name: 'X',
        ticker: 'XXX',
        metadataUri: 'ipfs://x',
        launcherPubkey: agent,
        shareholders: [{ wallet: agent, bps: 10_000, role: 'desk' }],
      }),
    ).rejects.toThrow(/VIBEVIBE_ENABLED/)
  })
})
