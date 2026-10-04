import type { CoinRecord } from '../lib/types'
import { modeLabel } from '../lib/edges'

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
        <span className="receipt-mode">{modeLabel(coin.mode)}</span>
      </div>
      <h4 className="receipt-title">
        ${coin.ticker} <span>crew locked</span>
      </h4>
      <p className="receipt-vibe">{coin.vibe || 'Fees hit the crew.'}</p>
      <div className="receipt-splits">
        {coin.crew.map((m) => (
          <div className="receipt-split" key={`${coin.mint}-${m.handle}`}>
            <span>{m.handle}</span>
            <strong>{m.share}%</strong>
          </div>
        ))}
      </div>
      <div className="receipt-foot">
        <span>0% platform cut</span>
        <span>mainnet</span>
      </div>
      <button className="btn btn-ghost btn-sm receipt-copy" type="button" onClick={onCopy}>
        {copied ? 'Copied for X' : 'Copy CT receipt'}
      </button>
    </div>
  )
}
