import { createConfig, http, type Config } from 'wagmi'
import { base, baseSepolia, type Chain } from 'wagmi/chains'
import { coinbaseWallet, injected, walletConnect } from 'wagmi/connectors'
import { defineChain } from 'viem'
import {
  evmChainsFromEnv,
  readWalletConnectProjectId,
  ROBINHOOD_CHAIN_ID,
  viteWalletEnv,
  type WalletEnv,
} from './wallet'

export const robinhood = defineChain({
  id: ROBINHOOD_CHAIN_ID,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.mainnet.chain.robinhood.com'] },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' },
  },
})

const KNOWN: Record<number, Chain> = {
  [base.id]: base,
  [baseSepolia.id]: baseSepolia,
  [robinhood.id]: robinhood,
}

export function evmChainObjects(env: WalletEnv = viteWalletEnv()): readonly [Chain, ...Chain[]] {
  const specs = evmChainsFromEnv(env)
  const chains = specs.map((spec) => KNOWN[spec.id]).filter((c): c is Chain => Boolean(c))
  if (chains.length === 0) return [base]
  return chains as [Chain, ...Chain[]]
}

export function createWagmiConfig(env: WalletEnv = viteWalletEnv()): Config {
  const chains = evmChainObjects(env)
  const projectId = readWalletConnectProjectId(env)
  const connectors = [
    injected({ shimDisconnect: true }),
    coinbaseWallet({
      appName: 'CrewPay',
      preference: 'all',
    }),
    ...(projectId
      ? [
          walletConnect({
            projectId,
            showQrModal: true,
            metadata: {
              name: 'CrewPay',
              description: 'Hire crew. Launch. Fees hit their wallets.',
              url: 'https://crewpay.dev',
              icons: ['https://crewpay.dev/brand/logo-mark.png'],
            },
          }),
        ]
      : []),
  ]

  return createConfig({
    chains,
    connectors,
    transports: Object.fromEntries(chains.map((chain) => [chain.id, http()])),
    ssr: false,
  })
}

export const wagmiConfig = createWagmiConfig()
