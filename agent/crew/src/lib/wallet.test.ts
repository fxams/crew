import { describe, expect, it } from 'vitest'
import {
  BASE_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID,
  ROBINHOOD_CHAIN_ID,
  detectInjected,
  evmChainIdForVenue,
  evmChainsFromEnv,
  injectedEvmLabel,
  isAndroidUserAgent,
  isMobileUserAgent,
  matchesListedWallet,
  networkForLaunch,
  backpackBrowseUrl,
  phantomBrowseUrl,
  readWalletConnectProjectId,
  robinhoodChainEnabled,
  shortAddr,
  solflareBrowseUrl,
  SOLANA_LISTED_WALLETS,
  EVM_LISTED_WALLETS,
  WALLETCONNECT_LISTED,
  walletConnectEnabled,
} from './wallet'

describe('wallet env', () => {
  it('reads VITE_WALLETCONNECT_PROJECT_ID', () => {
    expect(readWalletConnectProjectId({ VITE_WALLETCONNECT_PROJECT_ID: ' abc123 ' })).toBe('abc123')
    expect(walletConnectEnabled({ VITE_WALLETCONNECT_PROJECT_ID: 'abc123' })).toBe(true)
  })

  it('falls back to NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID', () => {
    expect(
      readWalletConnectProjectId({ NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: 'next_id' }),
    ).toBe('next_id')
  })

  it('hides WalletConnect when the project id is missing', () => {
    expect(readWalletConnectProjectId({})).toBe('')
    expect(readWalletConnectProjectId({ VITE_WALLETCONNECT_PROJECT_ID: '   ' })).toBe('')
    expect(walletConnectEnabled({})).toBe(false)
  })

  it('keeps Robinhood Chain off unless configured', () => {
    expect(robinhoodChainEnabled({})).toBe(false)
    expect(evmChainsFromEnv({}).map((c) => c.id)).toEqual([BASE_CHAIN_ID, BASE_SEPOLIA_CHAIN_ID])
    expect(robinhoodChainEnabled({ VITE_ROBINHOOD_CHAIN: '1' })).toBe(true)
    expect(robinhoodChainEnabled({ VITE_ROBINHOOD_CHAIN_ID: '4663' })).toBe(true)
    expect(evmChainsFromEnv({ VITE_ROBINHOOD_CHAIN: 'true' }).map((c) => c.id)).toContain(
      ROBINHOOD_CHAIN_ID,
    )
  })
})

describe('chain per action', () => {
  it('routes Pump.fun and Bags to Solana, Zora to EVM/Base', () => {
    expect(networkForLaunch('pumpfun')).toBe('solana')
    expect(networkForLaunch('bags')).toBe('solana')
    expect(networkForLaunch('zora')).toBe('evm')
    expect(evmChainIdForVenue('base')).toBe(BASE_CHAIN_ID)
    expect(evmChainIdForVenue('base-sepolia')).toBe(BASE_SEPOLIA_CHAIN_ID)
    expect(evmChainIdForVenue('robinhood')).toBe(ROBINHOOD_CHAIN_ID)
    expect(evmChainIdForVenue(undefined)).toBe(BASE_CHAIN_ID)
  })
})

describe('injected + mobile detection', () => {
  it('detects Phantom / in-app Solana and EVM providers', () => {
    const phantom = detectInjected({
      solana: { isPhantom: true },
      phantom: { solana: {}, ethereum: { isPhantom: true } },
      ethereum: { isPhantom: true, isMetaMask: true },
    })
    expect(phantom.solana).toBe(true)
    expect(phantom.evm).toBe(true)
    expect(phantom.solanaNames).toContain('Phantom')
    expect(phantom.evmNames).toContain('Phantom')
    expect(injectedEvmLabel({ ethereum: { isRabby: true, isMetaMask: true } })).toBe('Rabby')
  })

  it('keeps a generic browser-wallet fallback for in-app injectors', () => {
    const inApp = detectInjected({ ethereum: {}, solana: {} })
    expect(inApp.solanaNames).toEqual(['Solana wallet'])
    expect(inApp.evmNames).toEqual(['Browser wallet'])
  })

  it('builds Phantom + Solflare universal links for regular mobile browsers', () => {
    expect(isMobileUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true)
    expect(isAndroidUserAgent('Mozilla/5.0 (Linux; Android 14)')).toBe(true)
    expect(isMobileUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(false)
    const url = phantomBrowseUrl('https://crewpay.dev/launch', 'https://crewpay.dev')
    expect(url).toContain('https://phantom.com/ul/browse/')
    expect(url).toContain(encodeURIComponent('https://crewpay.dev/launch'))
    const solflare = solflareBrowseUrl('https://crewpay.dev/launch', 'https://crewpay.dev')
    expect(solflare).toContain('https://solflare.com/ul/v1/browse/')
    const backpack = backpackBrowseUrl('https://crewpay.dev/register')
    expect(backpack).toContain('https://backpack.app/ul/v1/browse/')
  })
})

describe('listed wallets', () => {
  it('covers the required Solana and EVM brands', () => {
    expect(SOLANA_LISTED_WALLETS.map((w) => w.name)).toEqual([
      'Phantom',
      'Solflare',
      'Backpack',
      'Coinbase',
    ])
    expect(EVM_LISTED_WALLETS.map((w) => w.name)).toEqual([
      'MetaMask',
      'Coinbase Wallet',
      'Rainbow',
      'Rabby',
      'Trust',
      'Phantom',
      'Backpack',
    ])
    expect(WALLETCONNECT_LISTED.name).toBe('WalletConnect')
    expect(matchesListedWallet(EVM_LISTED_WALLETS[0], 'io.metamask')).toBe(true)
    expect(matchesListedWallet(SOLANA_LISTED_WALLETS[0], 'Phantom')).toBe(true)
  })

  it('shortens addresses for the connect button', () => {
    expect(shortAddr('So11111111111111111111111111111111111111112')).toBe('So11…1112')
    expect(shortAddr('0x1111111111111111111111111111111111111111')).toBe('0x11…1111')
  })
})
