import { CREW_AGENT_API_URL } from './config'

export type SuiLaunchpadConfig = {
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

export type SuiPoolSummary = {
  poolId: string
  memeCoinType: string
  launcher: string
  targetSui: string
  suiReserve: string
  memeReserve: string
  virtualSui: string
  virtualMeme: string
  graduated: boolean
  migrated: boolean
  progressBps: number
  stage: 'new' | 'near_graduation' | 'graduated' | 'migrated'
  name?: string
  symbol?: string
  launchedAtMs?: number
  lockedVaultId?: string
}

export type SuiTradeRow = {
  kind: 'buy' | 'sell'
  poolId: string
  timestampMs?: number
  txDigest?: string
  suiAmount: string
  memeAmount: string
  feeSui: string
}

export type SuiFeeRecipients = {
  crew: string[]
  crewWeightBps: number[]
  agent: string
  treasury: string
  referrer: string | null
}

export type UnsignedSuiStep = {
  transactionBase64: string
  encoding: 'sui-tx'
  note?: string
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${CREW_AGENT_API_URL}${path}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error || res.statusText)
  }
  return res.json() as Promise<T>
}

export async function fetchSuiLaunchpadConfig(): Promise<SuiLaunchpadConfig> {
  return apiGet('/api/sui/launchpad/config')
}

export async function fetchSuiPools(): Promise<SuiPoolSummary[]> {
  const data = await apiGet<{ ok: boolean; pools: SuiPoolSummary[] }>('/api/sui/launchpad/pools')
  return data.pools
}

export async function fetchSuiPoolDetail(poolId: string): Promise<{
  pool: SuiPoolSummary
  trades: SuiTradeRow[]
  recipients: SuiFeeRecipients
}> {
  return apiGet(`/api/sui/launchpad/pools/${encodeURIComponent(poolId)}`)
}

export async function fetchSuiTradeUnsigned(body: {
  poolObjectId: string
  memeCoinType: string
  trader: string
  side: 'buy' | 'sell'
  amount: string
  slippageBps: number
  memeCoinObjectId?: string
}): Promise<UnsignedSuiStep> {
  const res = await fetch(`${CREW_AGENT_API_URL}/api/sui/launchpad/trade/unsigned`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = (await res.json()) as { ok?: boolean; step?: UnsignedSuiStep; error?: string }
  if (!res.ok || !json.step) throw new Error(json.error || 'Trade build failed')
  return json.step
}

export function suiscanObjectUrl(network: string | null, id: string): string {
  const base = network === 'testnet' ? 'https://suiscan.xyz/testnet' : 'https://suiscan.xyz'
  return `${base}/object/${id}`
}

export function suiscanTxUrl(network: string | null, digest: string): string {
  const base = network === 'testnet' ? 'https://suiscan.xyz/testnet' : 'https://suiscan.xyz'
  return `${base}/tx/${digest}`
}
