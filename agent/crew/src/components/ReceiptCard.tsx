import { PLATFORM_BUYBACK_BPS } from '../lib/config'
import type { CoinRecord } from '../lib/types'
import { modeLabel } from '../lib/edges'
import { PlatformBadge } from './PlatformBadge'

type Props = {
  coin: CoinRecord
  onCopy: () => void
  copied?: boolean
}

/** Screenshotable CT receipt — fee map + punchline. */
export function ReceiptCard({ coin, onCopy, copied }: Props) {
  return (
    <div className="receipt-card" aria-label="CREW receipt">
      <div className="receipt-top">
        <span className="receipt-brand">CREW</span>
        <span className="receipt-mode">
          <PlatformBadge platform={coin.platform} pumpUrl={coin.pumpUrl} mint={coin.mint} compact />
          {modeLabel(coin.mode)}
        </span>
      </div>
      <h4 className="receipt-title">
        ${coin.ticker} <span>crew locked</span>
      </h4>
      <p className="receipt-vibe">{coin.vibe || 'Fees hit the crew.'}</p>
      <div className="receipt-splits">
        <div className="receipt-split">
          <span>@crew-buyback</span>
          <strong>{PLATFORM_BUYBACK_BPS / 100}%</strong>
        </div>
        {coin.crew.map((m) => (
          <div className="receipt-split" key={`${coin.mint}-${m.handle}`}>
            <span>{m.handle}</span>
            <strong>{m.share}%</strong>
          </div>
        ))}
      </div>
      <div className="receipt-foot">
        <span>60% to the KOL crew · 15% to the launching agent · 25% to the treasury</span>
        <span>mainnet</span>
      </div>
      <button className="btn btn-ghost btn-sm receipt-copy" type="button" onClick={onCopy}>
        {copied ? 'Copied for X' : 'Copy CT receipt'}
      </button>
    </div>
  )
}
