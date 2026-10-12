import { useMemo, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from '@solana/wallet-adapter-react'
import { RPC_URL } from '../lib/config'
import { createSolanaAdapters } from '../lib/wallet-solana'
import { wagmiConfig } from '../lib/wallet-evm'
import { ConnectModalProvider } from '../components/ConnectModal'

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
          <SolanaWalletProvider wallets={wallets} autoConnect>
            <ConnectModalProvider>{children}</ConnectModalProvider>
          </SolanaWalletProvider>
        </ConnectionProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
