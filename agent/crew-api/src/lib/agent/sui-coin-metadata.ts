import { SuiGraphQLClient } from '@mysten/sui/graphql'
import { suiGraphqlUrl, suiNetwork } from './platforms.js'

const LEGACY_METADATA_OBJECTS_QUERY = `
query LegacyCoinMetadataObject($structType: String!) {
  objects(first: 1, filter: { type: $structType }) {
    nodes {
      address
    }
  }
}
`

let graphqlClientOverride: SuiGraphQLClient | null = null

export function setSuiGraphqlClientForTests(client: SuiGraphQLClient | null): void {
  graphqlClientOverride = client
}

export function getSuiGraphqlClient(): SuiGraphQLClient {
  if (graphqlClientOverride) return graphqlClientOverride
  return new SuiGraphQLClient({
    url: suiGraphqlUrl(),
    network: suiNetwork(),
  })
}

function legacyCoinMetadataStructType(coinType: string): string {
  const trimmed = coinType.trim()
  if (!trimmed) throw new Error('coinType is required')
  return `0x2::coin::CoinMetadata<${trimmed}>`
}

/** Resolve on-chain `0x2::coin::CoinMetadata<T>` object id via Sui GraphQL (not deprecated JSON-RPC). */
export async function resolveCoinMetadataObjectId(coinType: string): Promise<string> {
  const structType = legacyCoinMetadataStructType(coinType)
  const client = getSuiGraphqlClient()
  const { data, errors } = await client.query<{
    objects?: { nodes?: Array<{ address?: string } | null> } | null
  }>({
    query: LEGACY_METADATA_OBJECTS_QUERY,
    variables: { structType },
  })
  if (errors?.length) {
    throw new Error(`Sui GraphQL objects query failed: ${errors.map((e) => e.message).join('; ')}`)
  }
  const address = data?.objects?.nodes?.[0]?.address?.trim()
  if (!address) {
    throw new Error(`No legacy CoinMetadata object found for type ${coinType}`)
  }
  return address
}

export const SUI_COIN_TYPE = '0x2::sui::SUI'

export async function resolveSuiCoinMetadataObjectId(): Promise<string> {
  return resolveCoinMetadataObjectId(SUI_COIN_TYPE)
}
