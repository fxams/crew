import type { Express, Request } from 'express'

/**
 * Configure Express trust-proxy hops for req.ip.
 * When CREW_TRUST_CF=1, Cloudflare's CF-Connecting-IP is authoritative in
 * clientIp() — do not derive the client from X-Forwarded-For.
 */
export function configureTrustProxy(app: Express): void {
  if (process.env.CREW_TRUST_CF === '1') return
  const hops = Number(process.env.CREW_TRUST_PROXY_HOPS || 1)
  app.set('trust proxy', Number.isFinite(hops) && hops >= 0 ? hops : 1)
}

/**
 * Real client IP for rate-limit buckets.
 * - CREW_TRUST_CF=1 → CF-Connecting-IP (set by Cloudflare)
 * - otherwise → Express req.ip (with trust proxy hops from configureTrustProxy)
 *
 * Never reads the left-most X-Forwarded-For entry (spoofable by clients).
 */
export function clientIp(req: Request): string {
  if (process.env.CREW_TRUST_CF === '1') {
    const cf = (req.header('cf-connecting-ip') || '').trim()
    if (cf) return cf
  }
  return req.ip || 'unknown'
}
