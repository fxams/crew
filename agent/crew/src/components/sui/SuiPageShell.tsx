import type { ReactNode } from 'react'
import { SuiTestnetBadge } from './SuiTestnetBadge'

export function SuiPageShell({
  network,
  children,
}: {
  network: string | null
  children: ReactNode
}) {
  return (
    <div className="app-shell page-sui">
      <div className="sui-page-top-badge">
        <SuiTestnetBadge network={network} />
      </div>
      {children}
    </div>
  )
}
