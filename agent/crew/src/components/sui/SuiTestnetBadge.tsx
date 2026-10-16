export function SuiTestnetBadge({ network }: { network: string | null }) {
  const label = (network || 'testnet').toUpperCase()
  return (
    <span className="sui-testnet-badge" title="Sui launchpad is testnet-only">
      {label}
    </span>
  )
}
