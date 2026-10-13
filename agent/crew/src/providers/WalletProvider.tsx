import { useMemo, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from '@solana/wallet-adapter-react'
import { RPC_URL } from '../lib/config'
import { createSolanaAdapters } from '../lib/wallet-solana'
import { wagmiConfig } from '../lib/wallet-evm'
import { WALLET_ADAPTER_STORAGE_KEY, shouldAutoConnectWallet } from '../lib/wallet-session'
import { ConnectModalProvider } from '../components/ConnectModal'
import { WalletAuthProvider } from '../components/WalletAuthProvider'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false },
  },
})

export function WalletProvider({ children }: { children: ReactNode }) {
  const wallets = useMemo(() => createSolanaAdapters(), [])

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ConnectionProvider endpoint={RPC_URL}>
          <SolanaWalletProvider
            wallets={wallets}
            localStorageKey={WALLET_ADAPTER_STORAGE_KEY}
            autoConnect={async () => shouldAutoConnectWallet()}
          >
            <WalletAuthProvider>
              <ConnectModalProvider>{children}</ConnectModalProvider>
            </WalletAuthProvider>
          </SolanaWalletProvider>
        </ConnectionProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
