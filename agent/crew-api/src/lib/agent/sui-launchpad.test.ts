import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildLaunchpadMigrateTransaction,
  buildLaunchpadOpenPoolTransaction,
  buildSuiLaunchpadUnsignedLaunch,
  predictMemeCoinType,
} from './sui-launchpad.js'
import { setSuiGraphqlClientForTests } from './sui-coin-metadata.js'
import { setSuiClientForTests } from './sui-tx.js'

const launcher = '0x3adc8110d0a00a4d270238e49819fed76e6c9eaaf690c5331a8af1947089d473'
const kol = '0x2222222222222222222222222222222222222222222222222222222222222222'
const treas = '0x3333333333333333333333333333333333333333333333333333333333333333'
const treasuryCap = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const packageId = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const configId = '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
const migrationConfigId = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
const poolId = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
const publishedPkg = '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
const metadataSui = '0x587c29de216efd4219573e08a1f6964d4fa7cb714518c2c8a0f29abfa264327d'
const metadataMeme = '0x7c63cfc49923418778725e471e0e3003d2361109c76c9dbb1a238b19a8bb56b4'

afterEach(() => {
  setSuiClientForTests(null)
  setSuiGraphqlClientForTests(null)
  delete process.env.SUI_ENABLED
  delete process.env.SUI_TREASURY_ADDRESS
  delete process.env.SUI_NETWORK
  delete process.env.SUI_LAUNCHPAD
  delete process.env.CREWPAY_LAUNCHPAD_PACKAGE_ID
  delete process.env.CREWPAY_LAUNCHPAD_CONFIG_ID
  delete process.env.CREWPAY_LAUNCHPAD_MIGRATION_CONFIG_ID
})

function mockSuiClient() {
  return {
    getReferenceGasPrice: vi.fn().mockResolvedValue(1000n),
    dryRunTransactionBlock: vi.fn(),
    getNormalizedMoveFunction: vi.fn().mockResolvedValue({
      parameters: Array.from({ length: 12 }, () => ({ reference: false, body: { datatype: { Type: 'u64' } } })),
    }),
  } as never
}

describe('sui launchpad unsigned launch', () => {
  it('builds publish step only without treasury cap', async () => {
    process.env.SUI_ENABLED = '1'
    process.env.SUI_TREASURY_ADDRESS = treas
    process.env.SUI_LAUNCHPAD = 'crewpay'
    process.env.CREWPAY_LAUNCHPAD_PACKAGE_ID = packageId
    process.env.CREWPAY_LAUNCHPAD_CONFIG_ID = configId
    setSuiClientForTests(mockSuiClient())

    const plan = await buildSuiLaunchpadUnsignedLaunch({
      name: 'Desk Cat',
      ticker: 'DCAT',
      launcherPubkey: launcher,
      shareholders: [
        { wallet: kol, bps: 10_000, role: 'crew' },
        { wallet: launcher, bps: 1500, role: 'desk' },
        { wallet: treas, bps: 2500, role: 'platform' },
      ],
    })

    expect(plan.platform).toBe('sui')
    expect(plan.encoding).toBe('sui-tx')
    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0]?.kind).toBe('sui_launchpad_publish_coin')
    expect(plan.followUp).toBeTruthy()
    expect(plan.launchpad?.backend).toBe('crewpay')
    expect(plan.launchpad?.customConfigEnforced).toBe(true)
  })

  it('open pool tx calls create_pool_with_recipients on crewpay package', () => {
    process.env.SUI_ENABLED = '1'
    process.env.SUI_TREASURY_ADDRESS = treas
    process.env.SUI_LAUNCHPAD = 'crewpay'
    process.env.CREWPAY_LAUNCHPAD_PACKAGE_ID = packageId
    process.env.CREWPAY_LAUNCHPAD_CONFIG_ID = configId

    const memeType = predictMemeCoinType(publishedPkg)
    expect(memeType).toBe(`${publishedPkg}::meme::MEME`)
    const openTx = buildLaunchpadOpenPoolTransaction({
      launcherPubkey: launcher,
      treasuryCapObjectId: treasuryCap,
      memeCoinType: memeType,
      shareholders: [
        { wallet: kol, bps: 10_000, role: 'crew' },
        { wallet: launcher, bps: 1500, role: 'desk' },
        { wallet: treas, bps: 2500, role: 'platform' },
      ],
    })
    const openCall = openTx.getData().commands.find((c) => c.$kind === 'MoveCall')
    expect(openCall?.MoveCall?.package).toBe(packageId)
    expect(openCall?.MoveCall?.module).toBe('pool')
    expect(openCall?.MoveCall?.function).toBe('create_pool_with_recipients')
    expect(openCall?.MoveCall?.typeArguments?.[0]).toBe(memeType)
  })

  it('migrate tx builds live Cetus PTB (begin / create_pool_v2 / finish)', async () => {
    process.env.SUI_ENABLED = '1'
    process.env.SUI_TREASURY_ADDRESS = treas
    process.env.SUI_LAUNCHPAD = 'crewpay'
    process.env.CREWPAY_LAUNCHPAD_PACKAGE_ID = packageId
    process.env.CREWPAY_LAUNCHPAD_PUBLISHED_AT =
      '0x27353b5519bc5f3c9a6d543e717a2bce7f1dd66b903f727381b3d8121f431e4c'
    process.env.CREWPAY_LAUNCHPAD_CONFIG_ID = configId
    process.env.CREWPAY_LAUNCHPAD_MIGRATION_CONFIG_ID = migrationConfigId
    setSuiGraphqlClientForTests({
      query: vi.fn().mockImplementation(({ query, variables }) => {
        const q = String(query)
        if (q.includes('BondingPoolReserves')) {
          return Promise.resolve({
            data: {
              object: {
                asMoveObject: {
                  contents: {
                    json: {
                      sui: '790400000',
                      meme: '180989223542415031',
                      graduated: true,
                      migrated: false,
                      recipients: { treasury: treas },
                    },
                  },
                },
              },
            },
          })
        }
        const structType = variables?.structType as string
        if (structType?.includes('0x2::sui::SUI')) {
          return Promise.resolve({ data: { objects: { nodes: [{ address: metadataSui }] } } })
        }
        return Promise.resolve({ data: { objects: { nodes: [{ address: metadataMeme }] } } })
      }),
    } as never)

    const memeType = predictMemeCoinType(publishedPkg)
    const migrateTx = await buildLaunchpadMigrateTransaction({
      launcherPubkey: launcher,
      poolObjectId: poolId,
      memeCoinType: memeType,
    })
    const calls = migrateTx.getData().commands.filter((c) => c.$kind === 'MoveCall')
    expect(calls.map((c) => c.MoveCall?.function)).toContain(
      'finish_cetus_ptb_migration_locked_owned',
    )
    expect(calls.map((c) => c.MoveCall?.function)).toContain('create_cetus_lock_vault_for_ptb')
  })

  it('rejects when crewpay package env is missing', async () => {
    process.env.SUI_ENABLED = '1'
    process.env.SUI_TREASURY_ADDRESS = treas
    process.env.SUI_LAUNCHPAD = 'crewpay'
    setSuiClientForTests(mockSuiClient())
    await expect(
      buildSuiLaunchpadUnsignedLaunch({
        name: 'X',
        ticker: 'XXX',
        launcherPubkey: launcher,
        shareholders: [
          { wallet: kol, bps: 10_000, role: 'crew' },
          { wallet: launcher, bps: 1500, role: 'desk' },
          { wallet: treas, bps: 2500, role: 'platform' },
        ],
      }),
    ).rejects.toThrow(/CREWPAY_LAUNCHPAD_PACKAGE_ID/)
  })
})
