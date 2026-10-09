import { useEffect, useState } from 'react'

const API = (
  (import.meta.env.VITE_CREW_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'https://api.crewpay.dev'
)

const cache = new Map<string, string | null>()

/** Resolve the X handle for a registered Solana wallet (null if not registered). */
export function useOwnRegisteredHandle(wallet: string | null | undefined): string | null {
  const address = wallet?.trim() || ''
  const [handle, setHandle] = useState<string | null>(() =>
    address && cache.has(address) ? (cache.get(address) ?? null) : null,
  )

  useEffect(() => {
    if (!address) {
      setHandle(null)
      return
    }
    if (cache.has(address)) {
      setHandle(cache.get(address) ?? null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`${API}/api/kols/registered/wallet/${encodeURIComponent(address)}`)
        if (!res.ok) {
          cache.set(address, null)
          if (!cancelled) setHandle(null)
          return
        }
        const body = (await res.json()) as { profile?: { xUsername?: string } }
        const next = body.profile?.xUsername?.trim() || null
        cache.set(address, next)
        if (!cancelled) setHandle(next)
      } catch {
        if (!cancelled) setHandle(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [address])

  return handle
}
