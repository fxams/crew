import { ACP_HREF, acpChipLabel, type AcpInfo } from '../lib/acp'
import { IntegrationMark } from './IntegrationMark'

type Props = {
  acp: AcpInfo
  compact?: boolean
}

/** Virtuals ACP chip — icon + link, sits next to Pump / Bags / Zora / x402. */
export function AcpChip({ acp, compact }: Props) {
  const label = acpChipLabel(acp)
  return (
    <a
      className={`plat-badge plat-acp${compact ? ' is-compact' : ''}`}
      href={acp.href || ACP_HREF}
      target="_blank"
      rel="noreferrer"
      title={label}
      aria-label={label}
    >
      <span className="plat-mark" aria-hidden>
        <IntegrationMark kind="acp" />
      </span>
      {compact ? null : <span className="plat-name">ACP</span>}
    </a>
  )
}
