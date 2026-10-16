import { normalizeSuiAddress } from '@mysten/sui/utils'
import {
  crewpayLaunchpadConfigured,
  crewpayLaunchpadConfigId,
  crewpayLaunchpadPackageId,
  crewpayLaunchpadPublishedAt,
  suiEnabled,
  suiGraphqlUrl,
  suiLaunchpad,
  suiNetwork,
  suiReady,
  suiTreasuryConfigured,
} from './platforms.js'
import { getSuiGraphqlClient } from './sui-coin-metadata.js'
import { assertSuiAddress } from './sui-address.js'

export type LaunchpadPoolStage = 'new' | 'near_graduation' | 'graduated' | 'migrated'

export type LaunchpadFeeRecipients = {
  crew: string[]
  crewWeightBps: number[]
  agent: string
  treasury: string
  referrer: string | null
}

export type LaunchpadPoolSummary = {
  poolId: string
  memeCoinType: string
  launcher: string
  targetSui: bigint
  suiReserve: bigint
  memeReserve: bigint
  virtualSui: bigint
  virtualMeme: bigint
  graduated: boolean
  migrated: boolean
  progressBps: number
  stage: LaunchpadPoolStage
  name?: string
  symbol?: string
  launchedAtMs?: number
  lockedVaultId?: string
}

export type LaunchpadTradeRow = {
  kind: 'buy' | 'sell'
  poolId: string
  timestampMs?: number
  txDigest?: string
  suiAmount: bigint
  memeAmount: bigint
  feeSui: bigint
}

export type SuiLaunchpadPublicConfig = {
  enabled: boolean
  network: string | null
  launchpadBackend: 'crewpay' | 'memez' | null
  packageId: string | null
  publishedAt: string | null
  configId: string | null
  graphqlUrl: string | null
  explorer: 'suiscan'
  tradeFeeBps: number
  nearGraduationProgressBps: number
}

const NEAR_GRAD_BPS = 7000
const DEFAULT_TRADE_FEE_BPS = 120

export function suiLaunchpadPublicConfig(): SuiLaunchpadPublicConfig {
  const enabled = suiEnabled() && suiReady()
  let network: string | null = null
  let backend: 'crewpay' | 'memez' | null = null
  let packageId: string | null = null
  let publishedAt: string | null = null
  let configId: string | null = null
  if (suiEnabled()) {
    try {
      network = suiNetwork()
      backend = suiLaunchpad()
    } catch {
      network = 'testnet'
    }
    if (crewpayLaunchpadConfigured()) {
      try {
        packageId = crewpayLaunchpadPackageId()
        publishedAt = crewpayLaunchpadPublishedAt()
        configId = crewpayLaunchpadConfigId()
      } catch {
        /* partial config */
      }
    }
  }
  return {
    enabled,
    network,
    launchpadBackend: backend,
    packageId,
    publishedAt,
    configId,
    graphqlUrl: suiEnabled() ? suiGraphqlUrl() : null,
    explorer: 'suiscan',
    tradeFeeBps: DEFAULT_TRADE_FEE_BPS,
    nearGraduationProgressBps: NEAR_GRAD_BPS,
  }
}

export function normalizeMemeType(raw: string): string {
  const t = raw.trim()
  if (!t) return t
  const [addr, ...rest] = t.split('::')
  if (addr.startsWith('0x')) {
    return `${normalizeSuiAddress(addr)}::${rest.join('::')}`
  }
  return `0x${addr}::${rest.join('::')}`
}

export function parsePoolObjectJson(
  poolId: string,
  json: Record<string, unknown>,
): Omit<LaunchpadPoolSummary, 'name' | 'symbol' | 'launchedAtMs' | 'lockedVaultId'> {
  const sui = BigInt(String(json.sui ?? '0'))
  const meme = BigInt(String(json.meme ?? '0'))
  const target = BigInt(String(json.target_sui ?? '1'))
  const virtualSui = BigInt(String(json.virtual_sui ?? '0'))
  const virtualMeme = BigInt(String(json.virtual_meme ?? '0'))
  const graduated = Boolean(json.graduated)
  const migrated = Boolean(json.migrated)
  const memeTypeRaw = String(json.meme_type ?? '')
  const memeCoinType = normalizeMemeType(memeTypeRaw)
  const launcher = String(json.launcher ?? '')
  const progressBps =
    target > 0n ? Number((sui * 10_000n) / target > 10_000n ? 10_000n : (sui * 10_000n) / target) : 0
  const stage = poolStage({ graduated, migrated, progressBps })
  return {
    poolId: assertSuiAddress(poolId, 'poolId'),
    memeCoinType,
    launcher: launcher.startsWith('0x') ? assertSuiAddress(launcher, 'launcher') : launcher,
    targetSui: target,
    suiReserve: sui,
    memeReserve: meme,
    virtualSui,
    virtualMeme,
    graduated,
    migrated,
    progressBps,
    stage,
  }
}

export function poolStage(input: {
  graduated: boolean
  migrated: boolean
  progressBps: number
}): LaunchpadPoolStage {
  if (input.migrated) return 'migrated'
  if (input.graduated) return 'graduated'
  if (input.progressBps >= NEAR_GRAD_BPS) return 'near_graduation'
  return 'new'
}

export function parseFeeRecipients(json: Record<string, unknown>): LaunchpadFeeRecipients {
  const r = (json.recipients ?? {}) as Record<string, unknown>
  const crew = Array.isArray(r.crew) ? r.crew.map((a) => String(a)) : []
  const crewWeightBps = Array.isArray(r.crew_weight_bps)
    ? r.crew_weight_bps.map((n) => Number(n))
    : []
  const agent = String(r.agent ?? '')
  const treasury = String(r.treasury ?? '')
  const referrer = r.referrer == null ? null : String(r.referrer)
  return { crew, crewWeightBps, agent, treasury, referrer }
}

export function parseTradeEvent(
  eventType: string,
  json: Record<string, unknown>,
): LaunchpadTradeRow | null {
  if (eventType.endsWith('::pool::Bought')) {
    return {
      kind: 'buy',
      poolId: String(json.pool_id ?? ''),
      suiAmount: BigInt(String(json.sui_in ?? '0')),
      memeAmount: BigInt(String(json.meme_out ?? '0')),
      feeSui: BigInt(String(json.fee_sui ?? '0')),
    }
  }
  if (eventType.endsWith('::pool::Sold')) {
    return {
      kind: 'sell',
      poolId: String(json.pool_id ?? ''),
      suiAmount: BigInt(String(json.sui_out ?? '0')),
      memeAmount: BigInt(String(json.meme_in ?? '0')),
      feeSui: BigInt(String(json.fee_sui ?? '0')),
    }
  }
  return null
}

export function suiscanObjectUrl(network: string, objectId: string): string {
  const base = network === 'testnet' ? 'https://suiscan.xyz/testnet' : 'https://suiscan.xyz'
  return `${base}/object/${objectId}`
}

export function suiscanTxUrl(network: string, digest: string): string {
  const base = network === 'testnet' ? 'https://suiscan.xyz/testnet' : 'https://suiscan.xyz'
  return `${base}/tx/${digest}`
}

const POOL_OBJECT_QUERY = `
query PoolObject($id: SuiAddress!) {
  object(address: $id) {
    address
    asMoveObject {
      contents { json }
    }
  }
}
`

const LAUNCHED_EVENTS_QUERY = `
query LaunchedEvents($type: String!, $limit: Int!) {
  events(first: $limit, filter: { moveEventType: $type }) {
    nodes {
      timestamp
      transaction { digest }
      contents { json type { repr } }
    }
  }
}
`

const POOL_EVENTS_QUERY = `
query PoolTradeEvents($type: String!, $poolId: String!, $limit: Int!) {
  events(
    first: $limit
    filter: { moveEventType: $type, json: { pool_id: $poolId } }
  ) {
    nodes {
      timestamp
      transaction { digest }
      contents { json type { repr } }
    }
  }
}
`

const METADATA_QUERY = `
query CoinMeta($structType: String!) {
  objects(first: 1, filter: { type: $structType }) {
    nodes {
      asMoveObject {
        contents { json }
      }
    }
  }
}
`

export async function fetchLaunchpadPools(limit = 40): Promise<LaunchpadPoolSummary[]> {
  if (!suiReady() || suiLaunchpad() !== 'crewpay') return []
  const pkg = crewpayLaunchpadPackageId()
  const launchedType = `${pkg}::pool::Launched`
  const client = getSuiGraphqlClient()
  const { data, errors } = await client.query<{
    events?: {
      nodes?: Array<{
        timestamp?: string
        transaction?: { digest?: string }
        contents?: { json?: Record<string, unknown> }
      } | null>
    } | null
  }>({
    query: LAUNCHED_EVENTS_QUERY,
    variables: { type: launchedType, limit },
  })
  if (errors?.length) {
    throw new Error(errors.map((e) => e.message).join('; '))
  }
  const nodes = data?.events?.nodes ?? []
  const byId = new Map<string, { launchedAtMs?: number }>()
  for (const node of nodes) {
    const json = node?.contents?.json
    const poolId = String(json?.pool_id ?? '').trim()
    if (!poolId.startsWith('0x')) continue
    const ts = node?.timestamp ? Date.parse(node.timestamp) : undefined
    if (!byId.has(poolId)) byId.set(poolId, { launchedAtMs: ts })
  }
  const poolIds = [...byId.keys()].slice(0, limit)
  const summaries: LaunchpadPoolSummary[] = []
  for (const poolId of poolIds) {
    const detail = await fetchLaunchpadPool(poolId)
    if (detail) {
      detail.launchedAtMs = byId.get(poolId)?.launchedAtMs
      summaries.push(detail)
    }
  }
  summaries.sort((a, b) => (b.launchedAtMs ?? 0) - (a.launchedAtMs ?? 0))
  return summaries
}

export async function fetchLaunchpadPool(poolId: string): Promise<LaunchpadPoolSummary | null> {
  if (!suiReady()) return null
  const id = assertSuiAddress(poolId, 'poolId')
  const client = getSuiGraphqlClient()
  const { data, errors } = await client.query<{
    object?: { asMoveObject?: { contents?: { json?: Record<string, unknown> } | null } | null } | null
  }>({
    query: POOL_OBJECT_QUERY,
    variables: { id },
  })
  if (errors?.length) throw new Error(errors.map((e) => e.message).join('; '))
  const json = data?.object?.asMoveObject?.contents?.json
  if (!json) return null
  const base = parsePoolObjectJson(id, json)
  const meta = await fetchCoinSymbolName(base.memeCoinType).catch(() => ({}))
  return { ...base, ...meta }
}

export async function fetchCoinSymbolName(
  memeCoinType: string,
): Promise<{ name?: string; symbol?: string }> {
  const structType = `0x2::coin::CoinMetadata<${memeCoinType}>`
  const client = getSuiGraphqlClient()
  const { data } = await client.query<{
    objects?: { nodes?: Array<{ asMoveObject?: { contents?: { json?: Record<string, unknown> } } }> }
  }>({
    query: METADATA_QUERY,
    variables: { structType },
  })
  const json = data?.objects?.nodes?.[0]?.asMoveObject?.contents?.json
  if (!json) return {}
  return {
    name: json.name != null ? String(json.name) : undefined,
    symbol: json.symbol != null ? String(json.symbol) : undefined,
  }
}

export async function fetchPoolTrades(
  poolId: string,
  limit = 25,
): Promise<LaunchpadTradeRow[]> {
  if (!suiReady()) return []
  const pkg = crewpayLaunchpadPackageId()
  const id = assertSuiAddress(poolId, 'poolId')
  const client = getSuiGraphqlClient()
  const types = [`${pkg}::pool::Bought`, `${pkg}::pool::Sold`]
  const rows: LaunchpadTradeRow[] = []
  for (const type of types) {
    const { data, errors } = await client.query<{
      events?: {
        nodes?: Array<{
          timestamp?: string
          transaction?: { digest?: string }
          contents?: { json?: Record<string, unknown>; type?: { repr?: string } }
        }>
      }
    }>({
      query: POOL_EVENTS_QUERY,
      variables: { type, poolId: id, limit },
    })
    if (errors?.length) continue
    for (const node of data?.events?.nodes ?? []) {
      const repr = node.contents?.type?.repr ?? type
      const parsed = parseTradeEvent(repr, node.contents?.json ?? {})
      if (!parsed) continue
      rows.push({
        ...parsed,
        timestampMs: node.timestamp ? Date.parse(node.timestamp) : undefined,
        txDigest: node.transaction?.digest,
      })
    }
  }
  rows.sort((a, b) => (b.timestampMs ?? 0) - (a.timestampMs ?? 0))
  return rows.slice(0, limit)
}

export function launchpadEnabledForPublic(): boolean {
  return suiEnabled() && suiTreasuryConfigured() && crewpayLaunchpadConfigured()
}
