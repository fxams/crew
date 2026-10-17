import type { AcpInfo } from '../lib/acp'
import type { LaunchVenue } from '../lib/platforms'
import type { X402Info } from '../lib/x402'
import { AcpChip } from './AcpChip'
import { PlatformBadge } from './PlatformBadge'
import { X402Chip } from './X402Chip'

type Props = {
  venues: LaunchVenue[]
  x402: X402Info
  acp: AcpInfo
}

/** Pump.fun / Bags / Zora / Clanker / x402 / Virtuals ACP — one mobile-first icon row. */
export function PlatformChipRow({ venues, x402, acp }: Props) {
  return (
    <div className="plat-hero-row plat-chip-row" aria-label="Launch venues and integrations">
      {venues.map((v) => (
        <PlatformBadge key={v.id} platform={v.id} chipStack />
      ))}
      <X402Chip x402={x402} chipStack />
      <AcpChip acp={acp} chipStack />
    </div>
  )
}
