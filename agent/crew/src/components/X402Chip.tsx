import { X402_HREF, formatX402Networks, x402PayLabel, type X402Info } from '../lib/x402'
import { IntegrationMark } from './IntegrationMark'

type Props = {
  x402: X402Info
  compact?: boolean
  chipStack?: boolean
}

/** x402 pay-per-call chip — icon + link, styled like Pump / Bags / Zora / ACP. */
export function X402Chip({ x402, compact, chipStack }: Props) {
  const label = x402PayLabel(x402)
  const networks = formatX402Networks(x402.networks)
  return (
    <a
      className={`plat-badge plat-x402${compact ? ' is-compact' : ''}${chipStack ? ' is-chip-stack' : ''}`}
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
        <span className="plat-chip-text">
          <span className="plat-name">x402</span>
          <span className="plat-caption plat-x402-net">{networks}</span>
        </span>
      )}
    </a>
  )
}
