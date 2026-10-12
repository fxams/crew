import { WalletAdapterNetwork, type Adapter } from '@solana/wallet-adapter-base'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom'
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare'
import { CoinbaseWalletAdapter } from '@solana/wallet-adapter-coinbase'
import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack'
import {
  SolanaMobileWalletAdapter,
  createDefaultAddressSelector,
  createDefaultAuthorizationResultCache,
  createDefaultWalletNotFoundHandler,
} from '@solana-mobile/wallet-adapter-mobile'
import { CLUSTER } from './config'
import { isAndroidUserAgent } from './wallet'

function cluster(): 'mainnet-beta' | 'devnet' | 'testnet' {
  if (CLUSTER === 'devnet' || CLUSTER === 'testnet') return CLUSTER
  return 'mainnet-beta'
}

function network(): WalletAdapterNetwork {
  if (CLUSTER === 'devnet') return WalletAdapterNetwork.Devnet
  if (CLUSTER === 'testnet') return WalletAdapterNetwork.Testnet
  return WalletAdapterNetwork.Mainnet
}

/**
 * Explicit adapters cover mobile deep links (Phantom / Solflare / Coinbase / Backpack).
 * Wallet Standard wallets (any installed standard wallet) are still auto-detected
 * by @solana/wallet-adapter-react — do not list them all here.
 * Solana Mobile Wallet Adapter is Android-only.
 */
export function createSolanaAdapters(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent): Adapter[] {
  const adapters: Adapter[] = [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter({ network: network() }),
    new BackpackWalletAdapter(),
    new CoinbaseWalletAdapter(),
  ]

  if (isAndroidUserAgent(ua)) {
    adapters.unshift(
      new SolanaMobileWalletAdapter({
        addressSelector: createDefaultAddressSelector(),
        appIdentity: {
          name: 'CrewPay',
          uri: typeof location === 'undefined' ? 'https://crewpay.dev' : location.origin,
          icon: '/brand/logo-mark.png',
        },
        authorizationResultCache: createDefaultAuthorizationResultCache(),
        cluster: cluster(),
        onWalletNotFound: createDefaultWalletNotFoundHandler(),
      }),
    )
  }

  return adapters
}
