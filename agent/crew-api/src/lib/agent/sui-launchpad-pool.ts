import { getSuiGraphqlClient } from './sui-coin-metadata.js'
import { assertSuiAddress } from './sui-address.js'

const POOL_RESERVES_QUERY = `
query BondingPoolReserves($poolId: SuiAddress!) {
  object(address: $poolId) {
    asMoveObject {
      contents {
        json
      }
    }
  }
}
`

export type BondingPoolReserves = {
  suiReserve: bigint
  memeReserve: bigint
  refundTreasury: string
  graduated: boolean
  migrated: boolean
}

export async function fetchBondingPoolReserves(poolObjectId: string): Promise<BondingPoolReserves> {
  const poolId = assertSuiAddress(poolObjectId, 'poolObjectId')
  const client = getSuiGraphqlClient()
  const { data, errors } = await client.query<{
    object?: { asMoveObject?: { contents?: { json?: Record<string, unknown> } | null } | null } | null
  }>({
    query: POOL_RESERVES_QUERY,
    variables: { poolId },
  })
  if (errors?.length) {
    throw new Error(errors.map((e) => e.message).join('; '))
  }
  const json = data?.object?.asMoveObject?.contents?.json
  if (!json) throw new Error(`Bonding pool ${poolId} not found or not a Move object`)
  const sui = BigInt(String(json.sui ?? '0'))
  const meme = BigInt(String(json.meme ?? '0'))
  const recipients = json.recipients as { treasury?: string } | undefined
  const treasury = String(recipients?.treasury ?? '')
  if (!treasury.startsWith('0x')) {
    throw new Error(`Pool ${poolId} missing recipients.treasury for Cetus dust refund`)
  }
  return {
    suiReserve: sui,
    memeReserve: meme,
    refundTreasury: assertSuiAddress(treasury, 'refundTreasury'),
    graduated: Boolean(json.graduated),
    migrated: Boolean(json.migrated),
  }
}
