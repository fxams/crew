import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildLaunchpadOpenPoolTransaction,
  buildSuiLaunchpadUnsignedLaunch,
  predictMemeCoinType,
} from './sui-launchpad.js'
import { setSuiClientForTests } from './sui-tx.js'

const launcher = '0x3adc8110d0a00a4d270238e49819fed76e6c9eaaf690c5331a8af1947089d473'
const kol = '0x2222222222222222222222222222222222222222222222222222222222222222'
const treas = '0x3333333333333333333333333333333333333333333333333333333333333333'
const treasuryCap = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const packageId = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const configId = '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
const publishedPkg = '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'

afterEach(() => {
  setSuiClientForTests(null)
  delete process.env.SUI_ENABLED
  delete process.env.SUI_TREASURY_ADDRESS
  delete process.env.SUI_NETWORK
  delete process.env.SUI_LAUNCHPAD
  delete process.env.CREWPAY_LAUNCHPAD_PACKAGE_ID
  delete process.env.CREWPAY_LAUNCHPAD_CONFIG_ID
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
