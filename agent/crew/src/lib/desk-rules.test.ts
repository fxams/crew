import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearDeskStateForTests,
  evaluateDipGate,
  evaluateRaidGate,
  markDipFired,
  markRaidClaimed,
  patchMintDeskState,
} from './desk-rules'
import type { CoinRecord } from './types'

const MINT = 'So11111111111111111111111111111111111111112'

function coin(partial: Partial<CoinRecord> & { mode: CoinRecord['mode'] }): CoinRecord {
  return {
    id: 'c1',
    mint: MINT,
    name: 'Desk Cat',
    ticker: 'DCAT',
    vibe: 'test',
    crew: [{ handle: '@raid', wallet: MINT, share: 100, hireRole: 'raid' }],
    signature: 'sig',
    launchedAt: Date.now(),
    launcher: MINT,
    pumpUrl: 'https://pump.fun/coin/x',
    buybackRule: { dipPct: 18, maxSolPerFire: 0.25, cooldownHours: 4 },
    raidQuests: [
      { id: 'q_post', title: 'Post the chart', bountyBps: 4000, proof: 'X post link' },
    ],
    ...partial,
  }
}

beforeEach(() => {
  clearDeskStateForTests()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { [MINT]: { price: '1.0' } } }),
    })),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  clearDeskStateForTests()
})

describe('evaluateRaidGate', () => {
  it('requires proof', () => {
    const gate = evaluateRaidGate(coin({ mode: 'raid' }), { questId: 'q_post' })
    expect(gate.ok).toBe(false)
    if (!gate.ok) expect(gate.code).toBe('proof')
  })

  it('accepts https proof', () => {
    const gate = evaluateRaidGate(coin({ mode: 'raid' }), {
      questId: 'q_post',
      proofUrl: 'https://x.com/crew/status/1',
    })
    expect(gate.ok).toBe(true)
  })

  it('enforces per-quest cooldown', () => {
    markRaidClaimed(MINT, 'q_post')
    const gate = evaluateRaidGate(coin({ mode: 'raid' }), {
      questId: 'q_post',
      proofUrl: 'https://x.com/crew/status/1',
    })
    expect(gate.ok).toBe(false)
    if (!gate.ok) expect(gate.code).toBe('cooldown')
  })
})

describe('evaluateDipGate', () => {
  it('blocks when drop is below dipPct', async () => {
    patchMintDeskState(MINT, { localHighUsd: 2 })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ data: { [MINT]: { price: '1.9' } } }), // −5%
      })),
    )
    const gate = await evaluateDipGate(coin({ mode: 'buyback' }))
    expect(gate.ok).toBe(false)
    if (!gate.ok) expect(gate.code).toBe('no_dip')
  })

  it('allows when drop meets dipPct', async () => {
    patchMintDeskState(MINT, { localHighUsd: 2 })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ data: { [MINT]: { price: '1.5' } } }), // −25%
      })),
    )
    const gate = await evaluateDipGate(coin({ mode: 'buyback' }))
    expect(gate.ok).toBe(true)
    if (gate.ok) expect(gate.dropPct).toBeGreaterThanOrEqual(18)
  })

  it('enforces cooldown after fire', async () => {
    markDipFired(MINT)
    patchMintDeskState(MINT, { localHighUsd: 2 })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ data: { [MINT]: { price: '1.0' } } }),
      })),
    )
    const gate = await evaluateDipGate(coin({ mode: 'buyback' }))
    expect(gate.ok).toBe(false)
    if (!gate.ok) expect(gate.code).toBe('cooldown')
  })
})
