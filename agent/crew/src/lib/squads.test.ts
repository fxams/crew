import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  SQUADS_COLLECTING,
  SQUADS_DISCLAIMER_FALLBACK,
  SQUADS_DISPUTE_CONTACT,
  SQUADS_LIVE_COPY_NOTE,
  SQUADS_METHODOLOGY_URL,
  SQUADS_PRESTART_BADGE,
  isCapitalFlowsCollecting,
  isMomentumCollecting,
  isSquadsFeedStale,
  isSquadsPreStart,
  isWalletAgeCollecting,
  paperCopyBlocked,
  paperCopyScoreAfterFees,
  publicMemberLabel,
  readLocalKillSwitch,
  resolveSquadLabel,
  sharedFunders,
  squadNameById,
  squadsDisclaimer,
  squadsDisputeContact,
  squadsMethodologyUrl,
  writeLocalKillSwitch,
  type SquadRow,
} from './squads'

const here = dirname(fileURLToPath(import.meta.url))

describe('squads wording', () => {
  it('never uses cheat / cheating / cheat rank in squads sources', () => {
    const files = [
      join(here, 'squads.ts'),
      join(here, '../components/SquadsPage.tsx'),
    ]
    const banned = /\bcheat(ing|s|ed)?\b|\bcheat rank\b/i
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      expect(src, file).not.toMatch(banned)
    }
  })

  it('does not render AST / Qatar / +03:00 clocks', () => {
    const src = readFileSync(join(here, '../components/SquadsPage.tsx'), 'utf8')
    expect(src).not.toMatch(/updated_at_ast|start_ast|end_ast/)
    expect(src).not.toMatch(/Asia\/Qatar|\+03:00|\bQatar\b|\bAST\b/)
    expect(src).toContain('formatUtc')
    expect(src).toContain('formatUtcCountdown')
    expect(src).toContain('leaksNonUtcZone')
  })

  it('does not build, sign, or send swaps', () => {
    const src = readFileSync(join(here, '../components/SquadsPage.tsx'), 'utf8')
    expect(src).not.toMatch(/signTransaction|sendTransaction|jupiter|VersionedTransaction/i)
    expect(src).not.toMatch(/buildSwap|swapTransaction|jupiter swap/i)
    expect(src).toContain('SQUADS_LIVE_COPY_NOTE')
    expect(src).toContain('disabled')
  })

  it('uses the required disclaimer fallback and dispute contact', () => {
    expect(squadsDisclaimer({})).toBe(SQUADS_DISCLAIMER_FALLBACK)
    expect(squadsDisclaimer({ disclaimer: '  ' })).toBe(SQUADS_DISCLAIMER_FALLBACK)
    expect(squadsMethodologyUrl({})).toBe(SQUADS_METHODOLOGY_URL)
    expect(squadsDisputeContact({})).toBe(SQUADS_DISPUTE_CONTACT)
    expect(SQUADS_PRESTART_BADGE).toBe('pre-start, not contest PnL')
    expect(SQUADS_LIVE_COPY_NOTE).toBe('Live copy coming later')
  })
})

describe('squads collecting data', () => {
  it('treats empty momentum / wallet age / capital flows as collecting', () => {
    expect(isMomentumCollecting(null)).toBe(true)
    expect(
      isMomentumCollecting({
        '1h': { pnl_change_usd: null, rank_change: null, baseline: null },
        '6h': { pnl_change_usd: null, rank_change: null, baseline: null },
        '24h': { pnl_change_usd: null, rank_change: null, baseline: null },
      }),
    ).toBe(true)
    expect(
      isMomentumCollecting({
        '1h': { pnl_change_usd: 12, rank_change: 1, baseline: 0 },
        '6h': null,
        '24h': null,
      }),
    ).toBe(false)
    expect(isWalletAgeCollecting({ traced: 0, fresh_lt_14d: [], wallets: [] })).toBe(true)
    expect(isWalletAgeCollecting({ traced: 2, wallets: [{ wallet: 'Abcdefghijk' }] })).toBe(false)
    expect(isCapitalFlowsCollecting({ wallets_sampled: 0, wallets_total: 9 })).toBe(true)
    expect(isCapitalFlowsCollecting({ wallets_sampled: 3, wallets_total: 9 })).toBe(false)
    expect(SQUADS_COLLECTING).toBe('collecting data')
  })
})

describe('squads paper copy', () => {
  it('disables copy when paper, mainnet off, or kill switch', () => {
    expect(paperCopyBlocked({ mode: 'paper', mainnet_available: false })).toBe(true)
    expect(paperCopyBlocked({ mode: 'mainnet', mainnet_available: true })).toBe(true)
    expect(paperCopyBlocked({ mode: 'mainnet', mainnet_available: true, localKill: true })).toBe(true)
    expect(paperCopyScoreAfterFees({ realized_usd: 10, open_mtm_usd: -4 })).toBe(6)
    expect(paperCopyScoreAfterFees({ pnl_usd: 70.15, open_mtm_usd: -88.01 })).toBeCloseTo(-17.86)
  })

  it('persists a local kill switch', () => {
    const mem = new Map<string, string>()
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    }
    expect(readLocalKillSwitch(storage)).toBe(false)
    writeLocalKillSwitch(true, storage)
    expect(readLocalKillSwitch(storage)).toBe(true)
    writeLocalKillSwitch(false, storage)
    expect(readLocalKillSwitch(storage)).toBe(false)
  })
})

describe('squads privacy + helpers', () => {
  it('labels members with username, X handle, or wallet only', () => {
    expect(publicMemberLabel({ username: 'The__Solstice', wallet: '4ugDhHJ8XDXAeABmrNmGffFaLbJb9BkPyiFGVSV9ocwo' })).toBe(
      'The__Solstice',
    )
    expect(publicMemberLabel({ x_handle: '@woof', wallet: '4ugDhHJ8XDXAeABmrNmGffFaLbJb9BkPyiFGVSV9ocwo' })).toBe('woof')
    expect(publicMemberLabel({ wallet: '4ugDhHJ8XDXAeABmrNmGffFaLbJb9BkPyiFGVSV9ocwo' })).toBe('4ugD…ocwo')
  })

  it('maps squad ids to public names', () => {
    const squads: SquadRow[] = [
      { id: 'aaa', name: 'Alpha' },
      { id: 'bbb', name: 'Beta' },
    ]
    const names = squadNameById(squads)
    expect(resolveSquadLabel('aaa', names)).toBe('Alpha')
    expect(sharedFunders(squads)).toEqual([])
  })

  it('detects pre-start and stale feeds', () => {
    expect(isSquadsPreStart('pre-start')).toBe(true)
    expect(isSquadsPreStart('live')).toBe(false)
    expect(isSquadsFeedStale('2026-10-23T18:00:00Z', Date.parse('2026-10-23T18:10:00Z'))).toBe(false)
    expect(isSquadsFeedStale('2026-10-23T18:00:00Z', Date.parse('2026-10-23T18:40:00Z'))).toBe(true)
  })
})
