import type { PrivyClientConfig } from '@privy-io/react-auth'

/** Embedded Solana wallets only. CrewPay never holds keys. */
export const PRIVY_CLIENT_CONFIG: PrivyClientConfig = {
  loginMethods: ['email', 'google', 'apple'],
  appearance: {
    walletChainType: 'solana-only',
    theme: 'dark',
    accentColor: '#c8ff3d',
  },
  embeddedWallets: {
    ethereum: { createOnLogin: 'off' },
    solana: { createOnLogin: 'users-without-wallets' },
  },
}
