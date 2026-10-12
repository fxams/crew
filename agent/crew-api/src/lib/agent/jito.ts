/**
 * Jito block-engine RPC: multi-region broadcast, per-request timeouts,
 * tip-account resolution, and a cheap reachability probe for Render.
 */

export const JITO_DEFAULT_ENGINES = [
  'https://mainnet.block-engine.jito.wtf/api/v1/bundles',
  'https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/bundles',
  'https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/bundles',
  'https://ny.mainnet.block-engine.jito.wtf/api/v1/bundles',
  'https://tokyo.mainnet.block-engine.jito.wtf/api/v1/bundles',
] as const

/** Fallback tip accounts (mainnet) — prefer live getTipAccounts. */
export const JITO_TIP_ACCOUNTS_FALLBACK = [
  'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
  'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
  'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
  '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
  'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
  'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
  'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
  '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
]

const TIP_CAP_LAMPORTS = 10_000_000

export function jitoBundleUrls(): string[] {
  const extra = process.env.CREW_JITO_BUNDLE_URL?.trim()
  const out: string[] = []
  const seen = new Set<string>()
  for (const u of [extra, ...JITO_DEFAULT_ENGINES]) {
    if (!u || seen.has(u)) continue
    seen.add(u)
    out.push(u)
  }
  return out
}

export function jitoRpcTimeoutMs(): number {
  const n = Number(process.env.CREW_JITO_TIMEOUT_MS || '')
  if (Number.isFinite(n) && n >= 100) return Math.floor(n)
  return 8_000
}

export function jitoBundleAttempts(): number {
  const n = Number(process.env.CREW_JITO_ATTEMPTS || '')
  if (Number.isFinite(n) && n >= 1 && n <= 8) return Math.floor(n)
  return 4
}

export function jitoBackoffMs(attempt: number): number {
  return Math.min(8_000, 500 * 2 ** Math.max(0, attempt - 1))
}

/**
 * Tip in lamports. Base = CREW_JITO_TIP_LAMPORTS or 0.001 SOL.
 * Later attempts scale 1.5× / 2× / 2.5× … capped at 0.01 SOL.
 */
export function jitoTipLamports(override?: number, attempt = 1): number {
  let base = 1_000_000
  if (override != null && override > 0) base = Math.max(1_000, override)
  else {
    const fromEnv = Number(process.env.CREW_JITO_TIP_LAMPORTS || '')
    if (Number.isFinite(fromEnv) && fromEnv > 0) base = Math.max(1_000, Math.floor(fromEnv))
  }
  const scaled = Math.floor(base * (1 + 0.5 * Math.max(0, attempt - 1)))
  return Math.min(TIP_CAP_LAMPORTS, Math.max(1_000, scaled))
}

export async function jitoRpc(
  url: string,
  method: string,
  params: unknown[],
  timeoutMs = jitoRpcTimeoutMs(),
): Promise<unknown> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const uuid = process.env.CREW_JITO_UUID?.trim()
  if (uuid) headers['x-jito-auth'] = uuid
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: ac.signal,
    })
    const json = (await res.json()) as {
      result?: unknown
      error?: { message?: string }
    }
    if (json.error?.message) throw new Error(`${method}: ${json.error.message}`)
    if (!res.ok) throw new Error(`${method} HTTP ${res.status}`)
    return json.result
  } catch (err) {
    if (
      err instanceof Error &&
      (err.name === 'AbortError' || /aborted|abort/i.test(err.message))
    ) {
      throw new Error(`${method} timeout after ${timeoutMs}ms (${url})`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export async function resolveJitoTipAccount(): Promise<string> {
  const urls = jitoBundleUrls()
  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        const tips = (await jitoRpc(url, 'getTipAccounts', [])) as string[] | null
        if (Array.isArray(tips) && tips.length) return tips
      } catch {
        return null
      }
      return null
    }),
  )
  const tips = results.find((t): t is string[] => Array.isArray(t) && t.length > 0)
  if (tips?.length) {
    return tips[Math.floor(Math.random() * tips.length)]!
  }
  return JITO_TIP_ACCOUNTS_FALLBACK[
    Math.floor(Math.random() * JITO_TIP_ACCOUNTS_FALLBACK.length)
  ]!
}

export async function jitoSendBundleBroadcast(
  encodedTxs: string[],
): Promise<{ bundleId: string; urls: string[]; errors: string[] }> {
  // Jito defaults to base58 (deprecated). We encode base64 — must pass encoding.
  const params: unknown[] = [encodedTxs, { encoding: 'base64' }]
  const urls = jitoBundleUrls()
  const errors: string[] = []
  const accepted: { bundleId: string; url: string }[] = []

  async function tryUrl(url: string): Promise<void> {
    try {
      const result = await jitoRpc(url, 'sendBundle', params)
      if (!result) throw new Error('empty result')
      accepted.push({ bundleId: String(result), url })
    } catch (err) {
      errors.push(`${url}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  await Promise.all(urls.map((url) => tryUrl(url)))

  if (!accepted.length) {
    // Sequential retry — some Render egress paths fail under parallel fan-out.
    for (const url of urls) {
      await tryUrl(url)
      if (accepted.length) break
    }
  }

  if (!accepted.length) {
    throw new Error(`Jito bundle rejected by all engines — ${errors.join(' | ')}`)
  }
  return {
    bundleId: accepted[0]!.bundleId,
    urls: accepted.map((a) => a.url),
    errors,
  }
}

export type JitoEngineHealth = {
  url: string
  ok: boolean
  ms: number
  tipAccounts?: number
  error?: string
}

export type JitoHealth = {
  ok: boolean
  reachable: number
  engines: JitoEngineHealth[]
  tipLamports: number
}

/** Probe getTipAccounts on every regional engine (used by /health/jito + startup). */
export async function probeJitoEngines(): Promise<JitoHealth> {
  const urls = jitoBundleUrls()
  const engines = await Promise.all(
    urls.map(async (url): Promise<JitoEngineHealth> => {
      const started = Date.now()
      try {
        const tips = (await jitoRpc(url, 'getTipAccounts', [])) as string[] | null
        const n = Array.isArray(tips) ? tips.length : 0
        if (!n) throw new Error('no tip accounts')
        return { url, ok: true, ms: Date.now() - started, tipAccounts: n }
      } catch (err) {
        return {
          url,
          ok: false,
          ms: Date.now() - started,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    }),
  )
  const reachable = engines.filter((e) => e.ok).length
  return {
    ok: reachable > 0,
    reachable,
    engines,
    tipLamports: jitoTipLamports(),
  }
}
