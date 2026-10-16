const DEFAULT_GRAPHQL = 'https://graphql.testnet.sui.io/graphql'

function legacyCoinMetadataStructType(coinType) {
  const trimmed = coinType.trim()
  if (!trimmed) throw new Error('coinType is required')
  return `0x2::coin::CoinMetadata<${trimmed}>`
}

/** Resolve `0x2::coin::CoinMetadata<T>` object id (GraphQL objects filter — works for SUI and custom coins). */
export async function resolveCoinMetadataObjectId(coinType, graphqlUrl = process.env.SUI_GRAPHQL_URL || DEFAULT_GRAPHQL) {
  const structType = legacyCoinMetadataStructType(coinType)
  const res = await fetch(graphqlUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `query ($structType: String!) {
        objects(first: 1, filter: { type: $structType }) { nodes { address } }
      }`,
      variables: { structType },
    }),
  })
  const json = await res.json()
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join('; '))
  }
  const address = json.data?.objects?.nodes?.[0]?.address
  if (!address) throw new Error(`No legacy CoinMetadata for ${coinType}`)
  return address
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const coinType = process.argv[2]
  if (!coinType) {
    console.error('usage: node graphql-coin-metadata.mjs <coinType>')
    process.exit(1)
  }
  resolveCoinMetadataObjectId(coinType).then(
    (id) => console.log(id),
    (e) => {
      console.error(e)
      process.exit(1)
    },
  )
}
