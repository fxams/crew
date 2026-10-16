import type { SuiGraphQLClient } from '@mysten/sui/graphql'

/** Live Sui GraphQL rejects inline `filter: { type: … }` — pass EventFilter as a variable. */
export const EVENTS_BY_FILTER_QUERY = `
query EventsByFilter($filter: EventFilter!, $limit: Int!) {
  events(first: $limit, filter: $filter) {
    nodes {
      timestamp
      transaction { digest }
      contents { json }
    }
  }
}
`

export type GraphqlEventNode = {
  timestamp?: string
  transaction?: { digest?: string }
  contents?: { json?: Record<string, unknown> }
}

export type GraphqlEventsResponse = {
  events?: { nodes?: Array<GraphqlEventNode | null> | null } | null
}

export const SUI_GRAPHQL_MAX_EVENTS_PAGE = 50

export function eventFilterForMoveType(moveEventType: string): { type: string } {
  return { type: moveEventType }
}

export async function queryMoveEvents(
  client: SuiGraphQLClient,
  moveEventType: string,
  limit: number,
): Promise<GraphqlEventNode[]> {
  const capped = Math.min(Math.max(1, limit), SUI_GRAPHQL_MAX_EVENTS_PAGE)
  const { data, errors } = await client.query<GraphqlEventsResponse>({
    query: EVENTS_BY_FILTER_QUERY,
    variables: { filter: eventFilterForMoveType(moveEventType), limit: capped },
  })
  if (errors?.length) {
    throw new Error(errors.map((e) => e.message).join('; '))
  }
  return (data?.events?.nodes ?? []).filter((n): n is GraphqlEventNode => Boolean(n))
}

export function launchedPoolIdsFromEventNodes(
  nodes: GraphqlEventNode[],
): Map<string, { launchedAtMs?: number }> {
  const byId = new Map<string, { launchedAtMs?: number }>()
  for (const node of nodes) {
    const json = node.contents?.json
    const poolId = String(json?.pool_id ?? '').trim()
    if (!poolId.startsWith('0x')) continue
    const ts = node.timestamp ? Date.parse(node.timestamp) : undefined
    if (!byId.has(poolId)) byId.set(poolId, { launchedAtMs: ts })
  }
  return byId
}

export function tradeEventNodesForPool(nodes: GraphqlEventNode[], poolId: string): GraphqlEventNode[] {
  const want = poolId.toLowerCase()
  return nodes.filter((node) => {
    const pid = String(node.contents?.json?.pool_id ?? '').toLowerCase()
    return pid === want
  })
}
