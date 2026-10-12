export const OFFERING_AUTOHIRE = 'crewpay_autohire_kol_crew'
export const OFFERING_LAUNCH = 'crewpay_launch_with_crew'

export const DEFAULT_ACP_PRICE_AUTOHIRE_USD = 0.25
export const DEFAULT_ACP_PRICE_LAUNCH_USD = 1

export type AcpConfig = {
  enabled: boolean
  chainId: number
  signerKey: string
  walletAddress: `0x${string}` | ''
  walletId: string
  entityId: number
  builderCode: string
  priceAutohireUsd: number
  priceLaunchUsd: number
}

function flagOn(raw: string | undefined): boolean {
  const v = (raw || '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

function numEnv(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = (env[name] || '').trim()
  if (!raw) return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${name} must be a non-negative number`)
  }
  return n
}

/**
 * Privy P-256 authorization key from Virtuals "Add Signer"
 * (`signerPrivateKey` / `authorizationPrivateKey` on acp-node-v2).
 * Accept as given — not a 32-byte secp256k1 hex key. Never log it.
 */
function readSignerKey(raw: string | undefined): string {
  return (raw || '').trim()
}

function normalizeWalletAddress(raw: string | undefined): `0x${string}` | '' {
  const v = (raw || '').trim()
  if (!v) return ''
  const hex = v.startsWith('0x') ? v : `0x${v}`
  if (!/^0x[0-9a-fA-F]{40}$/.test(hex)) {
    throw new Error('ACP_WALLET_ADDRESS must be a 0x EVM address')
  }
  return hex as `0x${string}`
}

/** Load env. Never log ACP_SIGNER_KEY. Does not derive a wallet from the signer. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AcpConfig {
  const enabled = flagOn(env.ACP_ENABLED)
  const chainId = Math.floor(numEnv(env, 'ACP_CHAIN_ID', 84532))
  if (env.ACP_CHAIN_ID !== undefined && env.ACP_CHAIN_ID.trim() && chainId <= 0) {
    throw new Error('ACP_CHAIN_ID must be a positive integer (84532 Base Sepolia, 8453 Base)')
  }
  return {
    enabled,
    chainId,
    signerKey: enabled ? readSignerKey(env.ACP_SIGNER_KEY) : '',
    walletAddress: normalizeWalletAddress(env.ACP_WALLET_ADDRESS),
    walletId: (env.ACP_WALLET_ID || '').trim(),
    entityId: Math.floor(numEnv(env, 'ACP_ENTITY_ID', 1)),
    builderCode: (env.ACP_BUILDER_CODE || '').trim(),
    priceAutohireUsd: numEnv(env, 'ACP_PRICE_AUTOHIRE_USD', DEFAULT_ACP_PRICE_AUTOHIRE_USD),
    priceLaunchUsd: numEnv(env, 'ACP_PRICE_LAUNCH_USD', DEFAULT_ACP_PRICE_LAUNCH_USD),
  }
}

export function priceForOffering(config: AcpConfig, offering: string): number {
  if (offering === OFFERING_LAUNCH) return config.priceLaunchUsd
  return config.priceAutohireUsd
}

export function assertReadyToConnect(config: AcpConfig): void {
  if (!config.enabled) {
    throw new Error('ACP_ENABLED is off')
  }
  if (!config.signerKey) {
    throw new Error('ACP_SIGNER_KEY is required when ACP_ENABLED=1')
  }
  if (!config.walletAddress) {
    throw new Error('ACP_WALLET_ADDRESS is required when ACP_ENABLED=1 (do not derive from the Privy signer key)')
  }
  if (!config.walletId) {
    throw new Error(
      'ACP_WALLET_ID is required when ACP_ENABLED=1 (Virtuals agent page → Signers).',
    )
  }
}
