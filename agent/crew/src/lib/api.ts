import type { CoinRecord, RemitRecord } from './types'

const base = (import.meta.env.VITE_CREW_API_URL as string | undefined)?.replace(/\/$/, '') || ''
const apiKey = (import.meta.env.VITE_CREW_API_KEY as string | undefined)?.trim() || ''

export function apiConfigured(): boolean {
  return Boolean(base)
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!base) throw new Error('VITE_CREW_API_URL is not set')
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
