import { afterEach, describe, expect, it } from 'vitest'
import {
  applyRegisteredEvmWallets,
  buildZoraUnsignedLaunch,
  resolveZoraCrewWallets,
  setEncodeSplitForTests,
  setZoraCreateCoinCallForTests,
  setZoraEvmRpcForTests,
} from './zora.js'

const agent = '0x1111111111111111111111111111111111111111'
const kol = '0x2222222222222222222222222222222222222222'
const treas = '0x3333333333333333333333333333333333333333'
const split = '0x4444444444444444444444444444444444444444'
const coin = '0x5555555555555555555555555555555555555555'
const factory = '0x6666666666666666666666666666666666666666'

afterEach(() => {
  setEncodeSplitForTests(null)
  setZoraCreateCoinCallForTests(null)
  setZoraEvmRpcForTests(null)
  delete process.env.ZORA_ENABLED
  delete process.env.ZORA_CHAIN
  delete process.env.ZORA_TREASURY_ADDRESS
  delete process.env.ZORA_PLATFORM_REFERRER
})

describe('Zora unsigned launch', () => {
  it('maps registered evm wallets and rejects Solana-only crew', () => {
    const crew = applyRegisteredEvmWallets(
      [{ handle: '@alice', wallet: 'So11111111111111111111111111111111111111112', share: 100, hireRole: 'kol' }],
      [{ handle: 'alice', wallet: 'So11111111111111111111111111111111111111112', evmWallet: kol }],
    )
    expect(resolveZoraCrewWallets(crew)[0]?.wallet.toLowerCase()).toBe(kol)
    expect(() =>
      resolveZoraCrewWallets([
        { handle: '@bob', wallet: 'So11111111111111111111111111111111111111112', share: 100, hireRole: 'kol' },
      ]),
    ).toThrow(/EVM crew wallets/)
  })

  it('returns EIP-1559 split + create with 60/15/25 payout and CrewPay referrer', async () => {
    process.env.ZORA_ENABLED = '1'
    process.env.ZORA_CHAIN = 'base-sepolia'
    process.env.ZORA_TREASURY_ADDRESS = treas
    process.env.ZORA_PLATFORM_REFERRER = treas
    let splitRecipients: Array<{ address: string; bps: number }> = []
    let createArgs: Record<string, unknown> | null = null
    setEncodeSplitForTests(async (args) => {
      splitRecipients = args.recipients
      return { to: factory, data: '0xsplitdata', predictedSplit: split }
    })
    setZoraCreateCoinCallForTests(async (args) => {
      createArgs = args as unknown as Record<string, unknown>
      return {
        calls: [{ to: '0x777777751622c0d3258f214F9DF38E35BF45baF3', data: '0xcreatedata', value: 0n }],
        predictedCoinAddress: coin,
      }
    })
    setZoraEvmRpcForTests(async (method) => {
      if (method === 'eth_getTransactionCount') return '0x5'
      if (method === 'eth_getBlockByNumber') return { baseFeePerGas: '0x3b9aca00' }
      if (method === 'eth_maxPriorityFeePerGas') return '0x3b9aca00'
      if (method === 'eth_estimateGas') return '0x30d40'
      return '0x0'
    })

    const plan = await buildZoraUnsignedLaunch({
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

    expect(plan.platform).toBe('zora')
    expect(plan.encoding).toBe('eip1559')
    expect(plan.steps).toHaveLength(2)
    expect(plan.steps[0]?.kind).toBe('split')
    expect(plan.steps[1]?.kind).toBe('zora_create')
    expect(plan.steps[0]?.tx?.type).toBe(2)
    expect(plan.steps[0]?.tx?.chainId).toBe(84532)
    expect(plan.steps[1]?.tx?.nonce).toBe((plan.steps[0]?.tx?.nonce || 0) + 1)
    expect(plan.splitAddress).toBe(split)
    expect(plan.mint.toLowerCase()).toBe(coin)
    expect(createArgs?.payoutRecipientOverride).toBe(split)
    expect(String(createArgs?.platformReferrer).toLowerCase()).toBe(treas)
    expect(splitRecipients.find((r) => r.address.toLowerCase() === kol)?.bps).toBe(6000)
    expect(splitRecipients.find((r) => r.address.toLowerCase() === agent)?.bps).toBe(1500)
    expect(splitRecipients.find((r) => r.address.toLowerCase() === treas)?.bps).toBe(2500)
    expect(plan.note).not.toMatch(/launcher gets 60/i)
    expect(plan.warnings?.join(' ')).toMatch(/60% to the KOL crew/)
    expect(plan.warnings?.join(' ')).toMatch(/platform referrer/)
  })

  it('stays off without ZORA_ENABLED', async () => {
    await expect(
      buildZoraUnsignedLaunch({
        name: 'X',
        ticker: 'XXX',
        metadataUri: 'ipfs://x',
        launcherPubkey: agent,
        shareholders: [{ wallet: agent, bps: 10_000, role: 'desk' }],
      }),
    ).rejects.toThrow(/ZORA_ENABLED/)
  })
})
