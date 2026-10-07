import { describe, expect, it } from 'vitest'
import { DEFAULT_DRAFT } from '../../data'
import { getLaunchBlockers } from '../validation'
import { lookupKolDirectory } from './kol-directory'
import { applyNarrativeHire } from './narrative-hire'
import { bareHandle } from './resolve-wallet'

describe('autohire agent mode + directory resolve', () => {
  it('agent mode autohire sets hireRole so no Hire role blocker', () => {
    const draft = {
      ...DEFAULT_DRAFT,
      name: 'Agent Desk',
      ticker: 'AGENT',
      vibe: 'ai agent hires kols',
      mode: 'agent' as const,
      agent: { name: 'DeskBot', objective: 'Hire KOLs and grow the coin', model: 'custom' },
      crew: Array.from({ length: 4 }, () => ({ handle: '', wallet: '', share: 25 })),
    }
    const { draft: next, plan } = applyNarrativeHire(draft, { limit: 4 })
    expect(plan.hires.length).toBe(4)
    expect(next.crew.every((c) => Boolean(c.hireRole))).toBe(true)
    const blockers = getLaunchBlockers({
      ...next,
      imageFile: new File([new Uint8Array([1, 2, 3])], 'x.png', { type: 'image/png' }),
    })
    expect(blockers.filter((b) => b === 'Hire role')).toEqual([])
    expect(blockers.filter((b) => /Crew/.test(b))).toEqual([])
  })

  it('every autohired handle resolves via directory', () => {
    const { plan } = applyNarrativeHire(
      { ...DEFAULT_DRAFT, name: 'Trench Frog', ticker: 'FROG', vibe: 'degen trench meme raid' },
      { limit: 10 },
    )
    for (const h of plan.hires) {
      const handle = bareHandle(`@${h.kol.x || h.kol.pump}`)
      expect(handle).toBeTruthy()
      const row = lookupKolDirectory(handle!)
      expect(row, `missing directory for ${handle}`).toBeTruthy()
      expect(row!.wallet).toBe(h.kol.wallet)
    }
  })

  it('applyNarrativeHire replaces empty seats with wallets totaling 100%', () => {
    const draft = {
      ...DEFAULT_DRAFT,
      name: 'Pepe',
      ticker: 'PEPE',
      vibe: 'frog meme',
      holderKol: true,
      crew: Array.from({ length: 1 }, () => ({ handle: '', wallet: '', share: 100 })),
    }
    const seats = 5
    const base = { ...draft, holderKol: false, crew: draft.crew }
    const { draft: next, plan } = applyNarrativeHire(
      { ...base, crew: Array.from({ length: seats }, () => ({ handle: '', wallet: '', share: 0 })) },
      { limit: seats },
    )
    expect(plan.hires.length).toBe(seats)
    expect(next.crew).toHaveLength(seats)
    expect(next.crew.every((c) => c.wallet.length >= 32)).toBe(true)
    expect(next.crew.reduce((s, c) => s + c.share, 0)).toBe(100)
  })
})
