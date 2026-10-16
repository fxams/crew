import { X402_HREF, formatX402Networks, x402PayLabel, type X402Info } from '../lib/x402'
import { IntegrationMark } from './IntegrationMark'

type Props = {
  x402: X402Info
  compact?: boolean
}

/** x402 pay-per-call chip — icon + link, styled like Pump / Bags / Zora / ACP. */
export function X402Chip({ x402, compact }: Props) {
  const label = x402PayLabel(x402)
  return (
    <a
      className={`plat-badge plat-x402${compact ? ' is-compact' : ''}`}
      href={X402_HREF}
      target="_blank"
      rel="noreferrer"
      title={label}
      aria-label={label}
    >
      <span className="plat-mark" aria-hidden>
        <IntegrationMark kind="x402" />
      </span>
      {compact ? null : (
        <>
          <span className="plat-name">x402</span>
          <span className="plat-caption plat-x402-net">{formatX402Networks(x402.networks)}</span>
        </>
      )}
    </a>
  )
}
