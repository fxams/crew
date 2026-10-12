import { privateKeyToAccount } from 'viem/accounts'

export const OFFERING_AUTOHIRE = 'crewpay_autohire_kol_crew'
export const OFFERING_LAUNCH = 'crewpay_launch_with_crew'

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

function normalizePrivateKey(raw: string): `0x${string}` {
  const v = raw.trim()
  if (!v) return '' as `0x${string}`
  const hex = v.startsWith('0x') ? v : `0x${v}`
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('ACP_SIGNER_KEY must be a 32-byte hex key')
  }
  return hex as `0x${string}`
}

function deriveWallet(signerKey: string): `0x${string}` | '' {
  if (!signerKey) return ''
  try {
    return privateKeyToAccount(signerKey as `0x${string}`).address
  } catch {
    return ''
  }
}

/** Load env. Never log ACP_SIGNER_KEY. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AcpConfig {
  const enabled = flagOn(env.ACP_ENABLED)
  const chainId = Math.floor(numEnv(env, 'ACP_CHAIN_ID', 84532))
  if (env.ACP_CHAIN_ID !== undefined && env.ACP_CHAIN_ID.trim() && chainId <= 0) {
    throw new Error('ACP_CHAIN_ID must be a positive integer (84532 Base Sepolia, 8453 Base)')
  }
  const signerKey = enabled ? normalizePrivateKey(env.ACP_SIGNER_KEY || '') : ''
  const explicit = (env.ACP_WALLET_ADDRESS || '').trim()
  const walletAddress = (
    explicit
      ? (explicit.startsWith('0x') ? explicit : `0x${explicit}`)
      : deriveWallet(signerKey)
  ) as `0x${string}` | ''
  return {
    enabled,
    chainId,
    signerKey,
    walletAddress,
    walletId: (env.ACP_WALLET_ID || '').trim(),
    entityId: Math.floor(numEnv(env, 'ACP_ENTITY_ID', 1)),
    builderCode: (env.ACP_BUILDER_CODE || '').trim(),
    priceAutohireUsd: numEnv(env, 'ACP_PRICE_AUTOHIRE_USD', 0.02),
    priceLaunchUsd: numEnv(env, 'ACP_PRICE_LAUNCH_USD', 0.1),
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
    throw new Error('ACP_WALLET_ADDRESS is required (or a valid ACP_SIGNER_KEY to derive it)')
  }
  if (!config.walletId) {
    throw new Error(
      'ACP_WALLET_ID is required when ACP_ENABLED=1 (Virtuals agent page → Signers).',
    )
  }
}
