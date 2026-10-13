import { useWallet } from '@solana/wallet-adapter-react'
import { useAccount } from 'wagmi'
import { useConnectModal, type ConnectPreferred } from './ConnectModal'
import { useWalletAuth } from './WalletAuthProvider'
import { shortAddr, type LaunchAction, networkForLaunch } from '../lib/wallet'

type Props = {
  className?: string
  preferred?: ConnectPreferred
  platform?: LaunchAction | string
  evmChain?: string
  wide?: boolean
  connectedLabel?: string
  idleLabel?: string
}

export function ConnectButton({
  className,
  preferred,
  platform,
  evmChain,
  wide,
  connectedLabel,
  idleLabel = 'Connect',
}: Props) {
  const solana = useWallet()
  const { isAuthenticated } = useWalletAuth()
  const { address: evmAddress } = useAccount()
  const { open } = useConnectModal()
  const network = preferred || (platform ? networkForLaunch(platform) : 'any')
  const rawSol = solana.publicKey?.toBase58()
  const solAddr = rawSol && isAuthenticated(rawSol) ? rawSol : null
  const showEvm = network === 'evm' && evmAddress
  const label = showEvm
    ? shortAddr(evmAddress)
    : solAddr
      ? shortAddr(solAddr)
      : evmAddress
        ? shortAddr(evmAddress)
        : idleLabel
  const connected = Boolean(solAddr || evmAddress)

  return (
    <button
      type="button"
      className={`btn wallet-btn${wide ? ' btn-wide' : ' btn-nav'}${connected || !wide ? ' btn-ghost' : ' btn-primary'}${connected ? ' is-on' : ''}${className ? ` ${className}` : ''}`}
      title={connected ? 'Manage wallet' : 'Connect wallet'}
      aria-label={connected ? 'Manage wallet' : 'Connect wallet'}
      data-testid="connect-wallet"
      onClick={() => open({ preferred: network === 'any' ? undefined : network, platform, evmChain })}
    >
      {connected
        ? connectedLabel || (wide ? `Connected · ${label}` : label)
        : idleLabel}
    </button>
  )
}
