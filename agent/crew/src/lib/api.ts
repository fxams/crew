import type { CoinRecord, RemitRecord } from './types'

const base = (
  (import.meta.env.VITE_CREW_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'https://crewpay-api.onrender.com'
)
const apiKey = (import.meta.env.VITE_CREW_API_KEY as string | undefined)?.trim() || ''

export function apiConfigured(): boolean {
  return Boolean(base)
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!base) throw new Error('CREW API URL is not set')
  const headers = new Headers(init?.headers)
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json')
  }
  if (apiKey) headers.set('x-crew-api-key', apiKey)
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

export async function pushCoin(coin: CoinRecord): Promise<CoinRecord> {
  const { coin: saved } = await apiFetch<{ coin: CoinRecord }>('/api/coins', {
    method: 'PUT',
    body: JSON.stringify(coin),
  })
  return saved
}

export async function pushRemits(remits: RemitRecord[]): Promise<number> {
  if (!remits.length) return 0
  const { saved } = await apiFetch<{ saved: number }>('/api/remits', {
    method: 'POST',
    body: JSON.stringify({ remits }),
  })
  return saved
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
  coins: {
    mint: string
    ticker: string
    name: string
    mode: string
    feeShareLocked: boolean
    holderKol: boolean
    launchedAt: number
    pumpUrl: string
    launcher: string
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
}): Promise<Record<string, string>> {
  const signMessage = opts.wallet.signMessage
  if (!signMessage) return {}
  const timestamp = Date.now()
  const message = `crew-board:${opts.mint}:${timestamp}`
  const sig = await signMessage(new TextEncoder().encode(message))
  const { default: bs58 } = await import('bs58')
  return {
    'x-crew-wallet': opts.wallet.publicKey.toBase58(),
    'x-crew-timestamp': String(timestamp),
    'x-crew-signature': bs58.encode(sig),
    'x-crew-mint': opts.mint,
  }
}
