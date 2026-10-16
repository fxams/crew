import { Transaction } from '@mysten/sui/transactions'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SUI_MEMEZ_FEE_SPLIT_GAP,
  buildMemezPublishCoinTransaction,
  buildSuiMemezUnsignedLaunch,
} from './sui-memez.js'
import { setMemezPumpSdkForTests } from './sui-memez-client.js'

const launcher = '0x3adc8110d0a00a4d270238e49819fed76e6c9eaaf690c5331a8af1947089d473'
const kol = '0x2222222222222222222222222222222222222222222222222222222222222222'
const treas = '0x3333333333333333333333333333333333333333333333333333333333333333'
const treasuryCap = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

afterEach(() => {
  setMemezPumpSdkForTests(null)
  delete process.env.SUI_ENABLED
  delete process.env.SUI_TREASURY_ADDRESS
  delete process.env.MEMEZ_CONFIG_KEY
  delete process.env.SUI_NETWORK
})

describe('sui memez unsigned launch', () => {
  it('builds publish step only without treasury cap', async () => {
    process.env.SUI_ENABLED = '1'
    process.env.SUI_TREASURY_ADDRESS = treas

    const mockClient = {
      getReferenceGasPrice: vi.fn().mockResolvedValue(1000n),
      dryRunTransactionBlock: vi.fn().mockResolvedValue({
        effects: {
          status: { status: 'success' },
          gasUsed: {
            computationCost: '1000',
            storageCost: '1000',
            storageRebate: '0',
            nonRefundableStorageFee: '0',
          },
        },
      }),
    }
    setMemezPumpSdkForTests({
      client: mockClient as never,
      defaultSupply: 1_000_000_000_000_000_000n,
      getPumpData: vi.fn(),
      newPool: vi.fn(),
    } as never)

    const plan = await buildSuiMemezUnsignedLaunch({
      name: 'Desk Cat',
      ticker: 'DCAT',
      launcherPubkey: launcher,
      shareholders: [
        { wallet: kol, bps: 6000, role: 'crew' },
        { wallet: launcher, bps: 1500, role: 'desk' },
        { wallet: treas, bps: 2500, role: 'platform' },
      ],
    })

    expect(plan.platform).toBe('sui')
    expect(plan.encoding).toBe('sui-tx')
    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0]?.kind).toBe('sui_memez_publish_coin')
    expect(plan.followUp).toBeTruthy()
    expect(plan.warnings?.join(' ')).toContain(SUI_MEMEZ_FEE_SPLIT_GAP.slice(0, 32))
  })

  it('includes pool step when treasury cap is provided', async () => {
    process.env.SUI_ENABLED = '1'
    process.env.SUI_TREASURY_ADDRESS = treas
    process.env.MEMEZ_CONFIG_KEY =
      '0x9877fd4cade7740a391e4bb25c81bbe4763a905dd3f26608e9d53e9cd5f14c06::xpump::MemezConfigKey'

    const tx = new Transaction()
    const mockClient = {
      getReferenceGasPrice: vi.fn().mockResolvedValue(1000n),
      dryRunTransactionBlock: vi.fn().mockResolvedValue({
        effects: {
          status: { status: 'success' },
          gasUsed: {
            computationCost: '1000',
            storageCost: '1000',
            storageRebate: '0',
            nonRefundableStorageFee: '0',
          },
        },
      }),
    }
    setMemezPumpSdkForTests({
      client: mockClient as never,
      defaultSupply: 1_000_000_000_000_000_000n,
      getPumpData: vi.fn().mockResolvedValue({
        burnTax: 0n,
        virtualLiquidity: 5_000_000_000n,
        targetQuoteLiquidity: 3_000_000_000n,
        liquidityProvision: 0n,
      }),
      newPool: vi.fn().mockResolvedValue({ metadataCap: {}, tx }),
    } as never)

    const plan = await buildSuiMemezUnsignedLaunch({
      name: 'Desk Cat',
      ticker: 'DCAT',
      launcherPubkey: launcher,
      treasuryCapObjectId: treasuryCap,
      shareholders: [
        { wallet: kol, bps: 6000, role: 'crew' },
        { wallet: launcher, bps: 1500, role: 'desk' },
        { wallet: treas, bps: 2500, role: 'platform' },
      ],
    })

    expect(plan.steps).toHaveLength(2)
    expect(plan.steps[1]?.kind).toBe('sui_memez_create_pool')
    expect(plan.memez?.customConfigEnforced).toBe(true)
    expect(plan.warnings || []).toHaveLength(0)
  })

  it('publish tx uses embedded bytecode module', () => {
    const tx = buildMemezPublishCoinTransaction(launcher)
    expect(tx.getData().commands.some((c) => c.$kind === 'Publish')).toBe(true)
  })

  it('rejects mainnet network', async () => {
    process.env.SUI_ENABLED = '1'
    process.env.SUI_TREASURY_ADDRESS = treas
    process.env.SUI_NETWORK = 'mainnet'
    setMemezPumpSdkForTests({
      client: {
        getReferenceGasPrice: vi.fn(),
        dryRunTransactionBlock: vi.fn(),
      } as never,
    } as never)
    await expect(
      buildSuiMemezUnsignedLaunch({
        name: 'X',
        ticker: 'XXX',
        launcherPubkey: launcher,
        shareholders: [{ wallet: launcher, bps: 10_000, role: 'desk' }],
      }),
    ).rejects.toThrow(/testnet-only/)
  })
})
