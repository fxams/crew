/** Env + flags for the FLOP / tclk settlement rail. Off by default. */

export type FlopRailMode = 'memory' | 'flop-htlc'

function envFlag(name: string): boolean {
  const v = (process.env[name] || '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

export function flopEnabled(): boolean {
  return envFlag('FLOP_ENABLED')
}

export function flopRpcUrl(): string | null {
  const u = (process.env.FLOP_RPC_URL || '').trim()
  return u || null
}

export function flopChainId(): string {
  return (process.env.FLOP_CHAIN_ID || '').trim() || 'flop-testnet'
}

export function flopRailMode(): FlopRailMode {
  const raw = (process.env.FLOP_RAIL || '').trim().toLowerCase()
  if (raw === 'flop-htlc' || raw === 'flop') return 'flop-htlc'
  if (flopRpcUrl() && raw !== 'memory' && raw !== 'tclk-memory') return 'flop-htlc'
  return 'memory'
}

export function isFlopRailName(name: string | undefined): boolean {
  const n = (name || '').trim().toLowerCase()
  return n === 'flop' || n === 'flop-tclk' || n === 'tclk-memory' || n === 'flop-htlc'
}

export function isFlopChainId(chainId: string | undefined): boolean {
  if (!chainId) return false
  const id = chainId.trim().toLowerCase()
  return id === 'flop-testnet' || id === flopChainId().toLowerCase()
}

/** Names that must never appear in API/rail request bodies (non-custodial). */
const FORBIDDEN_SECRET_KEYS = new Set([
  'privatekey',
  'secretkey',
  'preimage',
  'secret',
  'mnemonic',
  'seed',
  'launcherkey',
  'privkey',
])

export function rejectCustodialSecrets(input: unknown): void {
  if (!input || typeof input !== 'object') return
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (value == null || value === '') continue
    const compact = key.toLowerCase().replace(/[_-]/g, '')
    if (FORBIDDEN_SECRET_KEYS.has(compact)) {
      throw new Error('Non-custodial rail: do not send secrets or private keys to the API')
    }
  }
}
