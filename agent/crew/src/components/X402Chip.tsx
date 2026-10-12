import { x402PayLabel, type X402Info } from '../lib/x402'

type Props = {
  x402: X402Info
  compact?: boolean
}

/** Small pay-per-call chip — sits next to Pump / Bags / Zora marks. */
export function X402Chip({ x402, compact }: Props) {
  return (
    <span
      className={`plat-badge plat-x402${compact ? ' is-compact' : ''}`}
      title={x402PayLabel(x402)}
    >
      <span className="plat-mark" aria-hidden>
        x
      </span>
      {compact ? null : <span className="plat-name">x402</span>}
    </span>
  )
}
