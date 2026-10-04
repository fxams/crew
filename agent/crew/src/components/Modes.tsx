import { MODE_BLURB, MODE_LABEL, type CrewMode } from '../lib/types'

const ORDER: CrewMode[] = ['fee-split', 'dip-buyback', 'raid-pool']

export function Modes() {
  return (
    <section className="section modes" id="modes">
      <div className="section-head">
        <p className="eyebrow">Three modes. Pick one.</p>
        <h2>Not Agency’s zoo. Not just a wire.</h2>
        <p className="section-sub">
          Agency funds an AI mind. X-DESK routes fees to X Money. CREW is the readable crew cut
          Pump CT can launch in one scroll.
        </p>
      </div>

      <div className="mode-story">
        {ORDER.map((mode) => (
          <article key={mode} className="mode-story-item">
            <h3>{MODE_LABEL[mode]}</h3>
            <p>{MODE_BLURB[mode]}</p>
          </article>
        ))}
      </div>

      <p className="zero-cut">0% platform cut. 100% allocated to the crew you tag at launch.</p>
    </section>
  )
}
