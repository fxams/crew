/**
 * Multichain wallet helpers — Solana (Wallet Standard / adapter) + EVM (wagmi).
 * Pure functions so tests do not need a browser or wallet extensions.
 */

export type WalletNetwork = 'solana' | 'evm'
export type LaunchAction = 'pumpfun' | 'bags' | 'zora'

export const WALLETCONNECT_ENV_KEYS = [
  'VITE_WALLETCONNECT_PROJECT_ID',
  'NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID',
] as const

export const BASE_CHAIN_ID = 8453
export const BASE_SEPOLIA_CHAIN_ID = 84532
export const ROBINHOOD_CHAIN_ID = 4663

export type EvmChainSpec = {
  id: number
  name: string
  testnet?: boolean
}

export const BASE_CHAIN: EvmChainSpec = { id: BASE_CHAIN_ID, name: 'Base' }
export const BASE_SEPOLIA_CHAIN: EvmChainSpec = {
  id: BASE_SEPOLIA_CHAIN_ID,
  name: 'Base Sepolia',
  testnet: true,
}
export const ROBINHOOD_CHAIN: EvmChainSpec = {
  id: ROBINHOOD_CHAIN_ID,
  name: 'Robinhood Chain',
}

export type WalletEnv = Record<string, string | undefined>

function readEnv(env: WalletEnv, key: string): string {
  return (env[key] || '').trim()
}

/** WalletConnect Cloud project id. Missing/blank → hide WalletConnect (QR + mobile deep link). */
export function readWalletConnectProjectId(env: WalletEnv = viteWalletEnv()): string {
  for (const key of WALLETCONNECT_ENV_KEYS) {
    const value = readEnv(env, key)
    if (value) return value
  }
  return ''
}

export function walletConnectEnabled(env: WalletEnv = viteWalletEnv()): boolean {
  return Boolean(readWalletConnectProjectId(env))
}

/**
 * Robinhood Chain is optional. Enable with VITE_ROBINHOOD_CHAIN=1 / true / 4663
 * (or VITE_ROBINHOOD_CHAIN_ID).
 */
export function robinhoodChainEnabled(env: WalletEnv = viteWalletEnv()): boolean {
  const raw = (readEnv(env, 'VITE_ROBINHOOD_CHAIN') || readEnv(env, 'VITE_ROBINHOOD_CHAIN_ID')).toLowerCase()
  if (!raw) return false
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === String(ROBINHOOD_CHAIN_ID)
}

export function evmChainsFromEnv(env: WalletEnv = viteWalletEnv()): EvmChainSpec[] {
  const chains: EvmChainSpec[] = [BASE_CHAIN, BASE_SEPOLIA_CHAIN]
  if (robinhoodChainEnabled(env)) chains.push(ROBINHOOD_CHAIN)
  return chains
}

/** Pump.fun + Bags.fm sign on Solana. Zora signs on Base (EVM). */
export function networkForLaunch(platform: LaunchAction | string | null | undefined): WalletNetwork {
  return platform === 'zora' || platform === 'clanker' || platform === 'vibevibe' ? 'evm' : 'solana'
}

export function evmChainIdForVenue(chain: string | null | undefined): number {
  if (chain === 'base-sepolia' || chain === 'sepolia') return BASE_SEPOLIA_CHAIN_ID
  if (chain === 'robinhood' || chain === String(ROBINHOOD_CHAIN_ID)) return ROBINHOOD_CHAIN_ID
  return BASE_CHAIN_ID
}

export function shortAddr(addr: string | null | undefined): string {
  if (!addr || addr.length < 10) return addr || '—'
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`
}

export type InjectedWindow = {
  solana?: { isPhantom?: boolean; isSolflare?: boolean; isBackpack?: boolean }
  phantom?: { solana?: unknown; ethereum?: { isPhantom?: boolean } }
  backpack?: unknown
  solflare?: unknown
  coinbaseSolana?: unknown
  ethereum?: {
    isMetaMask?: boolean
    isCoinbaseWallet?: boolean
    isCoinbaseBrowser?: boolean
    isRainbow?: boolean
    isRabby?: boolean
    isTrust?: boolean
    isTrustWallet?: boolean
    isPhantom?: boolean
    isBackpack?: boolean
    providers?: Array<{ isMetaMask?: boolean; isPhantom?: boolean }>
  }
}

export type InjectedDetection = {
  solana: boolean
  evm: boolean
  solanaNames: string[]
  evmNames: string[]
}

export function detectInjected(win: InjectedWindow | object | undefined | null): InjectedDetection {
  const view = win as InjectedWindow | undefined | null
  if (!view) return { solana: false, evm: false, solanaNames: [], evmNames: [] }

  const solanaNames: string[] = []
  if (view.phantom?.solana || view.solana?.isPhantom) solanaNames.push('Phantom')
  if (view.solflare || view.solana?.isSolflare) solanaNames.push('Solflare')
  if (view.backpack || view.solana?.isBackpack) solanaNames.push('Backpack')
  if (view.coinbaseSolana) solanaNames.push('Coinbase')
  if (view.solana && solanaNames.length === 0) solanaNames.push('Solana wallet')

  const evmNames: string[] = []
  const eth = view.ethereum
  if (view.phantom?.ethereum?.isPhantom || eth?.isPhantom) evmNames.push('Phantom')
  if (eth?.isCoinbaseWallet || eth?.isCoinbaseBrowser) evmNames.push('Coinbase Wallet')
  if (eth?.isRainbow) evmNames.push('Rainbow')
  if (eth?.isRabby) evmNames.push('Rabby')
  if (eth?.isTrust || eth?.isTrustWallet) evmNames.push('Trust')
  if (eth?.isBackpack) evmNames.push('Backpack')
  if (eth?.isMetaMask && !eth.isRabby && !eth.isRainbow) evmNames.push('MetaMask')
  if (eth && evmNames.length === 0) evmNames.push('Browser wallet')

  return {
    solana: Boolean(view.solana || view.phantom?.solana || view.backpack || view.solflare),
    evm: Boolean(eth || view.phantom?.ethereum),
    solanaNames: unique(solanaNames),
    evmNames: unique(evmNames),
  }
}

export function injectedEvmLabel(win: InjectedWindow | object | undefined | null): string {
  const names = detectInjected(win).evmNames
  return names[0] || 'Browser wallet'
}

export function isMobileUserAgent(ua: string | undefined | null): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua || '')
}

export function isAndroidUserAgent(ua: string | undefined | null): boolean {
  return /Android/i.test(ua || '')
}

/** Phantom universal-link browse — works from a regular mobile Safari/Chrome tab. */
export function phantomBrowseUrl(pageUrl: string, refOrigin: string): string {
  return `https://phantom.com/ul/browse/${encodeURIComponent(pageUrl)}?ref=${encodeURIComponent(refOrigin)}`
}

/** Solflare universal-link browse. */
export function solflareBrowseUrl(pageUrl: string, refOrigin: string): string {
  return `https://solflare.com/ul/v1/browse/${encodeURIComponent(pageUrl)}?ref=${encodeURIComponent(refOrigin)}`
}

/** Backpack in-app browse. */
export function backpackBrowseUrl(pageUrl: string): string {
  return `https://backpack.app/ul/v1/browse/${encodeURIComponent(pageUrl)}`
}

export type ListedWallet = {
  id: string
  name: string
  network: WalletNetwork
  /** EIP-6963 rdns or wallet-adapter name match (lowercase). */
  match: string[]
  installUrl: string
  mobile?: boolean
}

export const SOLANA_LISTED_WALLETS: ListedWallet[] = [
  {
    id: 'phantom',
    name: 'Phantom',
    network: 'solana',
    match: ['phantom'],
    installUrl: 'https://phantom.com/download',
    mobile: true,
  },
  {
    id: 'solflare',
    name: 'Solflare',
    network: 'solana',
    match: ['solflare'],
    installUrl: 'https://solflare.com/download',
    mobile: true,
  },
  {
    id: 'backpack',
    name: 'Backpack',
    network: 'solana',
    match: ['backpack'],
    installUrl: 'https://backpack.app/download',
  },
  {
    id: 'coinbase-solana',
    name: 'Coinbase',
    network: 'solana',
    match: ['coinbase', 'coinbase wallet'],
    installUrl: 'https://www.coinbase.com/wallet',
  },
]

export const EVM_LISTED_WALLETS: ListedWallet[] = [
  {
    id: 'metamask',
    name: 'MetaMask',
    network: 'evm',
    match: ['metamask', 'io.metamask'],
    installUrl: 'https://metamask.io/download',
  },
  {
    id: 'coinbase-evm',
    name: 'Coinbase Wallet',
    network: 'evm',
    match: ['coinbase', 'com.coinbase.wallet'],
    installUrl: 'https://www.coinbase.com/wallet',
  },
  {
    id: 'rainbow',
    name: 'Rainbow',
    network: 'evm',
    match: ['rainbow', 'me.rainbow'],
    installUrl: 'https://rainbow.me/download',
  },
  {
    id: 'rabby',
    name: 'Rabby',
    network: 'evm',
    match: ['rabby', 'io.rabby'],
    installUrl: 'https://rabby.io',
  },
  {
    id: 'trust',
    name: 'Trust',
    network: 'evm',
    match: ['trust', 'com.trustwallet.app'],
    installUrl: 'https://trustwallet.com/download',
  },
  {
    id: 'phantom-evm',
    name: 'Phantom',
    network: 'evm',
    match: ['phantom', 'app.phantom'],
    installUrl: 'https://phantom.com/download',
    mobile: true,
  },
  {
    id: 'backpack-evm',
    name: 'Backpack',
    network: 'evm',
    match: ['backpack', 'app.backpack'],
    installUrl: 'https://backpack.app/download',
  },
]

export const WALLETCONNECT_LISTED: ListedWallet = {
  id: 'walletconnect',
  name: 'WalletConnect',
  network: 'evm',
  match: ['walletconnect', 'walletconnectwallet'],
  installUrl: 'https://walletconnect.com',
  mobile: true,
}

export function matchesListedWallet(listed: ListedWallet, raw: string): boolean {
  const n = raw.trim().toLowerCase()
  return listed.match.some((m) => n === m || n.includes(m))
}

export function viteWalletEnv(): WalletEnv {
  const meta = (import.meta as { env?: WalletEnv }).env || {}
  return meta
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}
