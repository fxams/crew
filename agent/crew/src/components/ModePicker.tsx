import { MODE_BLURB, MODE_LABEL, type CrewMode } from '../lib/types'

const MODES: CrewMode[] = ['fee-split', 'dip-buyback', 'raid-pool']

type ModePickerProps = {
  value: CrewMode
  onChange: (mode: CrewMode) => void
}

export function ModePicker({ value, onChange }: ModePickerProps) {
  return (
    <div className="mode-picker" role="radiogroup" aria-label="Crew mode">
      {MODES.map((mode) => {
        const active = mode === value
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={active}
            className={`mode-option${active ? ' is-active' : ''}`}
            onClick={() => onChange(mode)}
          >
            <span className="mode-name">{MODE_LABEL[mode]}</span>
            <span className="mode-blurb">{MODE_BLURB[mode]}</span>
          </button>
        )
      })}
    </div>
  )
}
