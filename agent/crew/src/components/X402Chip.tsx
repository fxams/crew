import { X402_HREF, x402PayLabel, type X402Info } from '../lib/x402'
import { IntegrationMark } from './IntegrationMark'

type Props = {
  x402: X402Info
  compact?: boolean
  chipStack?: boolean
}

/** x402 pay-per-call chip — icon + link, styled like Pump / Bags / Zora / ACP. */
export function X402Chip({ x402, compact, chipStack }: Props) {
  const label = x402PayLabel(x402)
  const chipLabel = chipStack ? 'X402' : 'x402'
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
          <span className="plat-name">{chipLabel}</span>
        </span>
      )}
    </a>
  )
}
