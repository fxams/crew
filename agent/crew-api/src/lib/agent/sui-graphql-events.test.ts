import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  launchedPoolIdsFromEventNodes,
  tradeEventNodesForPool,
  type GraphqlEventsResponse,
} from './sui-graphql-events.js'
import { parsePoolObjectJson, parseTradeEvent } from './sui-launchpad-public.js'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/sui-testnet-graphql')

function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(fixtureDir, name), 'utf8')) as T
}

describe('sui-graphql-events (recorded testnet responses)', () => {
  it('parses Launched events into pool ids including migrated pools', () => {
    const body = loadJson<{ data: GraphqlEventsResponse }>('launched-events.json')
    const nodes = body.data.events?.nodes ?? []
    const byId = launchedPoolIdsFromEventNodes(nodes.filter((n) => n != null))
    expect(byId.has('0x268c853247f5f4b2314a4488930826746769413592310e46af0f4c783bd11020')).toBe(
      true,
    )
    expect(byId.has('0xdfff986f6a12c29e5fba0fe60bae7bc9c65ca0f94de0a0a43bf54cb83cba85bd')).toBe(
      true,
    )
    expect(byId.size).toBeGreaterThanOrEqual(5)
  })

  it('parses pool object json for 0x268c… migrated pool', () => {
    const body = loadJson<{
      data: { object?: { asMoveObject?: { contents?: { json?: Record<string, unknown> } } } }
    }>('pool-268c.json')
    const json = body.data.object?.asMoveObject?.contents?.json
    expect(json).toBeTruthy()
    const pool = parsePoolObjectJson(
      '0x268c853247f5f4b2314a4488930826746769413592310e46af0f4c783bd11020',
      json!,
    )
    expect(pool.migrated).toBe(true)
    expect(pool.graduated).toBe(true)
  })

  it('filters Bought events for pool 0x268c… and parses trades', () => {
    const pkg = '0x37cf5eccf86586fb10866c4a703e2098e2462aa437cb48100c04ba5ca57e3f64'
    const body = loadJson<{ data: GraphqlEventsResponse }>('bought-events.json')
    const nodes = (body.data.events?.nodes ?? []).filter((n) => n != null)
    const poolId = '0x268c853247f5f4b2314a4488930826746769413592310e46af0f4c783bd11020'
    const forPool = tradeEventNodesForPool(nodes, poolId)
    expect(forPool.length).toBeGreaterThanOrEqual(1)
    const row = parseTradeEvent(`${pkg}::pool::Bought`, forPool[0]!.contents?.json ?? {})
    expect(row?.kind).toBe('buy')
    expect(row?.suiAmount).toBeGreaterThan(0n)
  })
})
