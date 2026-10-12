/** Virtuals ACP hire channel. Prefer GET /api/platforms → acp over hardcoding. */

export const ACP_HREF = 'https://app.virtuals.io/acp'

export type AcpPrices = {
  autohire: string
  launch: string
}

export type AcpInfo = {
  enabled: boolean
  name: string
  href: string
  chain: string
  chainId: number
  prices: AcpPrices
}

/** Shown when discovery is unreachable. Base mainnet, $0.25 autohire / $1 launch. */
export const FALLBACK_ACP: AcpInfo = {
  enabled: true,
  name: 'Virtuals ACP',
  href: ACP_HREF,
  chain: 'base',
  chainId: 8453,
  prices: { autohire: '$0.25', launch: '$1.00' },
}

type RawAcp = {
  enabled?: unknown
  name?: unknown
  href?: unknown
  url?: unknown
  chain?: unknown
  chainId?: unknown
  pricesUsd?: {
    crewpay_autohire_kol_crew?: unknown
    crewpay_launch_with_crew?: unknown
  }
  prices?: {
    autohire?: unknown
    launch?: unknown
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

/** Pull the acp object from /api/platforms or nested discovery. */
export function pickAcpRaw(doc: unknown): RawAcp | null {
  const root = asRecord(doc)
  if (!root) return null
  if (asRecord(root.acp)) return root.acp as RawAcp
  const platforms = asRecord(root.platforms)
  if (platforms && asRecord(platforms.acp)) return platforms.acp as RawAcp
  return null
}

function formatUsd(raw: unknown, fallback: string): string {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
    return `$${raw.toFixed(2)}`
  }
  if (typeof raw !== 'string') return fallback
  const n = Number(raw.trim().replace(/^\$/, ''))
  if (!Number.isFinite(n) || n < 0) return fallback
  return `$${n.toFixed(2)}`
}

function parseChainId(raw: unknown): number {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) return raw
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number(raw.trim())
    if (Number.isInteger(n) && n > 0) return n
  }
  return FALLBACK_ACP.chainId
}

function parseChain(raw: unknown, chainId: number): string {
  if (typeof raw === 'string') {
    const v = raw.trim().toLowerCase()
    if (v === 'base' || v === 'base-sepolia') return v
  }
  if (chainId === 84532) return 'base-sepolia'
  return 'base'
}

export function normalizeAcp(raw: RawAcp | null | undefined): AcpInfo {
  if (!raw) {
    return {
      ...FALLBACK_ACP,
      prices: { ...FALLBACK_ACP.prices },
    }
  }
  const chainId = parseChainId(raw.chainId)
  const href =
    (typeof raw.href === 'string' && raw.href.trim()) ||
    (typeof raw.url === 'string' && raw.url.trim()) ||
    FALLBACK_ACP.href
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : FALLBACK_ACP.name
  return {
    enabled: raw.enabled === true,
    name,
    href,
    chain: parseChain(raw.chain, chainId),
    chainId,
    prices: {
      autohire: formatUsd(
        raw.prices?.autohire ?? raw.pricesUsd?.crewpay_autohire_kol_crew,
        FALLBACK_ACP.prices.autohire,
      ),
      launch: formatUsd(
        raw.prices?.launch ?? raw.pricesUsd?.crewpay_launch_with_crew,
        FALLBACK_ACP.prices.launch,
      ),
    },
  }
}

export function acpFromDoc(doc: unknown): AcpInfo {
  return normalizeAcp(pickAcpRaw(doc))
}

export function acpChainLabel(chain: string): string {
  if (chain === 'base-sepolia') return 'Base Sepolia'
  return 'Base'
}

/** Chip title: Virtuals ACP (Base, $0.25 autohire · $1.00 launch) */
export function acpChipLabel(info: AcpInfo): string {
  return `${info.name} (${acpChainLabel(info.chain)}, ${info.prices.autohire} autohire · ${info.prices.launch} launch)`
}
