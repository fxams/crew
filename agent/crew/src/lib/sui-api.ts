import { CREW_AGENT_API_URL, CREW_PUBLIC_API_URL } from './config'

/** Resolved API base used for Sui launchpad fetches (documented for ops). */
export function suiLaunchpadApiBase(): string {
  return CREW_AGENT_API_URL
}

export function suiLaunchpadApiBasePublic(): string {
  return CREW_PUBLIC_API_URL
}

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

const CONFIG_TIMEOUT_MS = 12_000

export const DISABLED_SUI_LAUNCHPAD_CONFIG: SuiLaunchpadConfig = {
  enabled: false,
  network: 'testnet',
  launchpadBackend: null,
  packageId: null,
  publishedAt: null,
  configId: null,
  graphqlUrl: null,
  explorer: 'suiscan',
  tradeFeeBps: 120,
  nearGraduationProgressBps: 7000,
}

async function fetchWithTimeout(path: string, init?: RequestInit): Promise<Response> {
  const url = `${CREW_AGENT_API_URL}${path}`
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(CONFIG_TIMEOUT_MS),
  })
}

/** Treat 404/5xx/network errors as disabled launchpad (Coming soon). */
export async function fetchSuiLaunchpadConfig(): Promise<SuiLaunchpadConfig> {
  try {
    const res = await fetchWithTimeout('/api/sui/launchpad/config')
    if (!res.ok) return { ...DISABLED_SUI_LAUNCHPAD_CONFIG }
    const json = (await res.json()) as SuiLaunchpadConfig
    return {
      ...DISABLED_SUI_LAUNCHPAD_CONFIG,
      ...json,
      network: json.network ?? 'testnet',
    }
  } catch {
    return { ...DISABLED_SUI_LAUNCHPAD_CONFIG }
  }
}

export async function fetchSuiPools(): Promise<SuiPoolSummary[]> {
  try {
    const res = await fetchWithTimeout('/api/sui/launchpad/pools')
    if (!res.ok) return []
    const data = (await res.json()) as { ok: boolean; pools: SuiPoolSummary[] }
    return data.pools ?? []
  } catch {
    return []
  }
}

export async function fetchSuiPoolDetail(poolId: string): Promise<{
  pool: SuiPoolSummary
  trades: SuiTradeRow[]
  recipients: SuiFeeRecipients
}> {
  const res = await fetchWithTimeout(`/api/sui/launchpad/pools/${encodeURIComponent(poolId)}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error || res.statusText)
  }
  return res.json() as Promise<{
    pool: SuiPoolSummary
    trades: SuiTradeRow[]
    recipients: SuiFeeRecipients
  }>
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
  const res = await fetchWithTimeout('/api/sui/launchpad/trade/unsigned', {
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
