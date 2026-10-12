import {
  explorerLabel,
  explorerTokenUrl,
  explorerTxUrl,
  inferLaunchPlatform,
  tradeLabel,
  tradeUrl,
  type LaunchPlatform,
} from '../lib/platforms'

type Props = {
  mint: string
  pumpUrl?: string | null
  platform?: string | null
  signature?: string | null
  className?: string
  size?: 'sm' | 'md'
}

/** Trade + explorer links that follow the coin's venue. */
export function TradeLinks({ mint, pumpUrl, platform, signature, className, size = 'sm' }: Props) {
  const id: LaunchPlatform = inferLaunchPlatform({ platform, pumpUrl, mint })
  const trade = pumpUrl && pumpUrl.startsWith('https://') ? pumpUrl : tradeUrl(id, mint)
  const token = explorerTokenUrl(id, mint)
  const tx = signature ? explorerTxUrl(id, signature) : null
  const btn = size === 'sm' ? 'btn btn-ghost btn-sm' : 'btn btn-ghost'
  return (
    <div className={className || 'success-actions'}>
      <a className={btn} href={trade} target="_blank" rel="noreferrer">
        {tradeLabel(id)}
      </a>
      {token ? (
        <a className={btn} href={token} target="_blank" rel="noreferrer">
          {explorerLabel(id)}
        </a>
      ) : null}
      {tx ? (
        <a className={btn} href={tx} target="_blank" rel="noreferrer">
          Tx
        </a>
      ) : null}
    </div>
  )
}
