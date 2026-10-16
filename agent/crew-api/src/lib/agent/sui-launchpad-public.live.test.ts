import { describe, expect, it } from 'vitest'
import { SuiGraphQLClient } from '@mysten/sui/graphql'
import { setSuiGraphqlClientForTests } from './sui-coin-metadata.js'
import {
  fetchLaunchpadPool,
  fetchLaunchpadPools,
  fetchPoolTrades,
} from './sui-launchpad-public.js'

const LIVE = process.env.SUI_LIVE_GRAPHQL === '1'
const PKG =
  process.env.CREWPAY_LAUNCHPAD_PACKAGE_ID ||
  '0x37cf5eccf86586fb10866c4a703e2098e2462aa437cb48100c04ba5ca57e3f64'

describe.skipIf(!LIVE)('sui-launchpad-public live GraphQL (testnet)', () => {
  it('lists pools and resolves known migrated pool ids with trades', async () => {
    process.env.SUI_ENABLED = '1'
    process.env.SUI_NETWORK = 'testnet'
    process.env.SUI_LAUNCHPAD = 'crewpay'
    process.env.SUI_TREASURY_ADDRESS =
      '0x3333333333333333333333333333333333333333333333333333333333333333'
    process.env.CREWPAY_LAUNCHPAD_PACKAGE_ID = PKG
    process.env.CREWPAY_LAUNCHPAD_CONFIG_ID =
      process.env.CREWPAY_LAUNCHPAD_CONFIG_ID ||
      '0x3360244e91cdfbd66c4e7086b1f8e57659c923eb610637f0541733246282895a'
    process.env.SUI_GRAPHQL_URL = 'https://graphql.testnet.sui.io/graphql'

    setSuiGraphqlClientForTests(
      new SuiGraphQLClient({
        url: 'https://graphql.testnet.sui.io/graphql',
        network: 'testnet',
      }),
    )

    const pools = await fetchLaunchpadPools(50)
    const ids = pools.map((p) => p.poolId)
    expect(ids).toContain('0xdfff986f6a12c29e5fba0fe60bae7bc9c65ca0f94de0a0a43bf54cb83cba85bd')

    const migrated = await fetchLaunchpadPool(
      '0x268c853247f5f4b2314a4488930826746769413592310e46af0f4c783bd11020',
    )
    expect(migrated?.migrated).toBe(true)

    const trades = await fetchPoolTrades(
      '0x268c853247f5f4b2314a4488930826746769413592310e46af0f4c783bd11020',
      10,
    )
    expect(trades.length).toBeGreaterThan(0)
    expect(trades[0]?.kind).toMatch(/buy|sell/)
  })
})
