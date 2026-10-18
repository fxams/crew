import type { CoinRecord, RemitRecord } from './types'

const base = (
  (import.meta.env.VITE_CREW_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'https://api.crewpay.dev'
)

export function apiConfigured(): boolean {
  return Boolean(base)
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!base) throw new Error('CREW API URL is not set')
  const headers = new Headers(init?.headers)
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(`${base}${path}`, { ...init, headers })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `API ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function fetchBoard(): Promise<{
  coins: CoinRecord[]
  remits: RemitRecord[]
}> {
  return apiFetch('/api/board')
}

export type BoardWallet = {
  publicKey: { toBase58(): string }
  signMessage?: (msg: Uint8Array) => Promise<Uint8Array>
}

export async function pushCoin(
  coin: CoinRecord,
  opts?: { wallet?: BoardWallet | null },
): Promise<CoinRecord> {
  const headers: Record<string, string> = {}
  if (opts?.wallet?.publicKey && opts.wallet.signMessage) {
    Object.assign(
      headers,
      await boardWriteHeaders({ mint: coin.mint, wallet: opts.wallet, body: coin }),
    )
  }
  const { coin: saved } = await apiFetch<{ coin: CoinRecord }>('/api/coins', {
    method: 'PUT',
    headers,
    body: JSON.stringify(coin),
  })
  return saved
}

export async function pushRemits(_remits: RemitRecord[]): Promise<number> {
  // Browser does not persist remits to the API anymore; server ingests chain data itself.
  return 0
}

export type ApiKol = {
  id: string
  rank: number
  pump: string
  x: string | null
  followers: number
  wallet: string
  aliases: string[]
  narratives: string[]
  correlated: string[]
  roles: string[]
}

export async function searchKols(q: string, limit = 20): Promise<ApiKol[]> {
  const params = new URLSearchParams({
    q,
    limit: String(limit),
  })
  const { kols } = await apiFetch<{ kols: ApiKol[] }>(`/api/kols?${params}`)
  return kols
}

export async function apiHealth(): Promise<{ ok: boolean; kols?: number }> {
  return apiFetch('/api/healthz')
}

export type ProofBundle = {
  ok: boolean
  generatedAt: number
  platform: {
    buybackWallet: string | null
    crewMint: string | null
    kolDirectorySize: number
  }
  stats: {
    coins: number
    feeShareLocked: number
    remitRows: number
    remitSolTotal: number
    buybackRuns: number
    buybackOkRuns: number
    buybackSolSpent: number
    modeActions: number
    /** Per-role attribution (crew/desk/platform/agent-referral/referral/unknown). */
    byRole?: { role: string; remits: number; sol: number }[]
    /** Convenience totals focused on humans (crew only). */
    humansPaidSol?: number
    humansPaidRemits?: number
  }
  buybacks: {
    id: number
    status: string
    solSpent: number | null
    crewMint: string | null
    signature: string | null
    detail: string | null
    at: number
  }[]
  remits: RemitRecord[]
  /** Top KOL leaderboard (crew-only), if server provides it. */
  leaderboard?: { handle: string; totalSol: number; remits: number; tickers: string[] }[]
  coins: {
    mint: string
    ticker: string
    name: string
    mode: string
    feeShareLocked: boolean
    holderKol: boolean
    unlockedExpired?: boolean
    adminRevoked?: boolean
    launchedAt: number
    pumpUrl: string
    launcher: string
    platform?: string
  }[]
  modeActions: {
    id: string
    mint: string
    mode: string
    kind: string
    amountSol: number
    wallet: string
    handle: string
    signature: string
    detail: string | null
    at: number
  }[]
}

export async function fetchProof(limit = 40): Promise<ProofBundle> {
  const params = new URLSearchParams({ limit: String(limit) })
  return apiFetch(`/api/proof?${params}`)
}

export type AgentLeaderboardRow = {
  rank: number
  wallet: string
  agentName: string | null
  xHandle: string | null
  coinsLaunched: number
  earnedSol: number
  earnedEth: number
  lastPayoutAt: number | null
  lastPayoutSignature: string | null
  lastPayoutMint: string | null
}

export type AgentEarnedOnCoin = {
  wallet: string
  agentName: string | null
  xHandle: string | null
  earnedSol: number
  earnedEth: number
  lastPayoutAt: number | null
  lastPayoutSignature: string | null
  remitCount: number
}

export type AgentLeaderboardBundle = {
  ok: boolean
  generatedAt: number
  role: 'desk'
  shareBps: number
  source: string
  disclaimer: string
  empty: boolean
  emptyReason: string | null
  rows: AgentLeaderboardRow[]
}

export async function fetchAgentLeaderboard(limit = 20): Promise<AgentLeaderboardBundle> {
  const params = new URLSearchParams({ limit: String(limit) })
  return apiFetch(`/api/agents/leaderboard?${params}`)
}

export async function pushModeAction(action: {
  id: string
  mint: string
  mode: string
  kind: 'dip_fire' | 'raid_claim' | 'desk_preview'
  amountSol: number
  wallet?: string
  handle?: string
  signature: string
  detail?: string
}): Promise<void> {
  await apiFetch('/api/mode-actions', {
    method: 'POST',
    body: JSON.stringify(action),
  })
}

/** Optional Phantom-signed board write headers. */
export async function boardWriteHeaders(opts: {
  mint: string
  wallet: { publicKey: { toBase58(): string }; signMessage?: (msg: Uint8Array) => Promise<Uint8Array> }
  body: unknown
}): Promise<Record<string, string>> {
  const signMessage = opts.wallet.signMessage
  if (!signMessage) return {}
  // Canonical JSON: stable key order, deterministic stringify
  function sortKeys(value: any): any {
    if (Array.isArray(value)) return value.map(sortKeys)
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {}
      for (const k of Object.keys(value).sort()) out[k] = sortKeys((value as any)[k])
      return out
    }
    return value
  }
  async function sha256Hex(text: string): Promise<string> {
    const enc = new TextEncoder().encode(text)
    const digest = await crypto.subtle.digest('SHA-256', enc)
    const arr = Array.from(new Uint8Array(digest))
    return arr.map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  const canonical = JSON.stringify(sortKeys(opts.body))
  const bodyHash = await sha256Hex(canonical)
  // Fetch a single-use nonce tied to the wallet
  const wallet58 = opts.wallet.publicKey.toBase58()
  const { nonce } = await apiFetch<{ ok: boolean; nonce: string; expiresAt: string }>(
    '/api/board/nonce',
    { method: 'POST', headers: { 'x-crew-wallet': wallet58 } },
  )
  const timestamp = Date.now()
  const message = `crew-board:${opts.mint}:${bodyHash}:${nonce}:${timestamp}`
  const sig = await signMessage(new TextEncoder().encode(message))
  const { default: bs58 } = await import('bs58')
  return {
    'x-crew-wallet': wallet58,
    'x-crew-timestamp': String(timestamp),
    'x-crew-signature': bs58.encode(sig),
    'x-crew-mint': opts.mint,
    'x-crew-nonce': nonce,
  }
}
