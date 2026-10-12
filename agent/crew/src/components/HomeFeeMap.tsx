import { useState } from 'react'
import { creatorFeeSplit } from '../lib/fee-split'

type SegId = 'crew' | 'agent' | 'referrer' | 'treasury'

type Seg = {
  id: SegId
  pct: number
  title: string
  blurb: string
}

function segments(referred: boolean): Seg[] {
  const s = creatorFeeSplit(referred)
  const rows: Seg[] = [
    {
      id: 'crew',
      pct: s.crew,
      title: 'KOL crew',
      blurb: '60% to the KOL crew — split across hired seats',
    },
    {
      id: 'agent',
      pct: s.agent,
      title: 'Launching agent',
      blurb: '15% to the launching agent — not the 60% crew slice',
    },
  ]
  if (referred) {
    rows.push({
      id: 'referrer',
      pct: s.referrer,
      title: 'Referrer KOL',
      blurb: 'Only when the agent claimed a key with your code',
    })
  }
  rows.push({
    id: 'treasury',
    pct: s.treasury,
      title: 'Treasury',
      blurb: referred
        ? '20% to the treasury after the 5% referrer cut — buyback cron not live'
        : '25% to the treasury — buyback cron not live',
  })
  return rows
}

const LABEL_MIN_PCT = 12

/** Public homepage fee bar + legend. Default 60/15/25; toggle referred 60/15/5/20. */
export function HomeFeeMap() {
  const [referred, setReferred] = useState(false)
  const segs = segments(referred)
  const aria = segs.map((row) => `${row.pct}% ${row.title}`).join(', ')

  return (
    <div className="home-fee-map">
      <div className="plat-filter home-fee-toggle" role="tablist" aria-label="Fee split">
        <button
          type="button"
          role="tab"
          aria-selected={!referred}
          className={`plat-filter-btn${!referred ? ' is-on' : ''}`}
          onClick={() => setReferred(false)}
        >
          Default 60/15/25
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={referred}
          className={`plat-filter-btn${referred ? ' is-on' : ''}`}
          onClick={() => setReferred(true)}
        >
          With referrer 60/15/5/20
        </button>
      </div>
      <div className="home-fee-bar" role="img" aria-label={aria}>
        {segs.map((row) => (
          <span
            key={row.id}
            className={`home-fee-seg is-${row.id}`}
            style={{ flexGrow: row.pct }}
          >
            {row.pct >= LABEL_MIN_PCT ? (
              <span className="home-fee-seg-label">{row.pct}%</span>
            ) : null}
          </span>
        ))}
      </div>
      <div className="home-fee-legend">
        {segs.map((row) => (
          <div key={row.id} className={`is-${row.id}`}>
            <strong>{row.pct}%</strong>
            <span>{row.title}</span>
            <em>{row.blurb}</em>
          </div>
        ))}
      </div>
    </div>
  )
}
