import { describe, expect, it } from 'vitest'
import {
  AGENT_LEADERBOARD_DISCLAIMER,
  agentEarnedForMint,
  buildAgentLeaderboard,
  isDeskRemit,
  parseAgentName,
  remitAsset,
  type AgentLeaderboardCoin,
  type AgentLeaderboardRemit,
} from './agent-leaderboard.js'

const SOL_MINT = 'So11111111111111111111111111111111111111112'
const ETH_MINT = '0x1111111111111111111111111111111111111111'
const LAUNCHER_A = 'DeskWalletAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const LAUNCHER_B = 'DeskWalletBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'
const CREW_W = 'CrewWalletCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC'

function coin(partial: Partial<AgentLeaderboardCoin> & Pick<AgentLeaderboardCoin, 'mint' | 'launcher'>): AgentLeaderboardCoin {
  return {
    mint: partial.mint,
    launcher: partial.launcher,
    platform: partial.platform,
    pumpUrl: partial.pumpUrl ?? `https://pump.fun/coin/${partial.mint}`,
    agent: partial.agent,
    agentKeyId: partial.agentKeyId,
  }
}

function remit(
  partial: Partial<AgentLeaderboardRemit> & Pick<AgentLeaderboardRemit, 'mint' | 'wallet' | 'amountSol'>,
): AgentLeaderboardRemit {
  return {
    mint: partial.mint,
    wallet: partial.wallet,
    amountSol: partial.amountSol,
    at: partial.at ?? 1_700_000_000_000,
    signature: partial.signature ?? 'sig',
    role: partial.role,
    handle: partial.handle,
  }
}

describe('isDeskRemit', () => {
  it('keeps role=desk and unlabelled launcher wallet', () => {
    expect(isDeskRemit({ role: 'desk', wallet: LAUNCHER_A, launcher: LAUNCHER_A })).toBe(true)
    expect(isDeskRemit({ role: null, wallet: LAUNCHER_A, launcher: LAUNCHER_A })).toBe(true)
  })

  it('drops crew / platform / referral even when wallet is the launcher', () => {
    expect(isDeskRemit({ role: 'crew', wallet: LAUNCHER_A, launcher: LAUNCHER_A })).toBe(false)
    expect(isDeskRemit({ role: 'platform', wallet: LAUNCHER_A, launcher: LAUNCHER_A })).toBe(false)
    expect(isDeskRemit({ role: 'agent-referral', wallet: LAUNCHER_A, launcher: LAUNCHER_A })).toBe(false)
    expect(isDeskRemit({ role: 'kol', wallet: LAUNCHER_A, launcher: LAUNCHER_A })).toBe(false)
  })
})

describe('parseAgentName / remitAsset', () => {
  it('does not invent a name from empty agent json', () => {
    expect(parseAgentName(null)).toBeNull()
    expect(parseAgentName({ name: 'x' })).toBeNull()
    expect(parseAgentName({ name: 'DeskCat' })).toBe('DeskCat')
  })

  it('classifies EVM trade URLs as eth without inventing amounts', () => {
    expect(remitAsset(coin({ mint: SOL_MINT, launcher: LAUNCHER_A }))).toBe('sol')
    expect(
      remitAsset(
        coin({
          mint: ETH_MINT,
          launcher: LAUNCHER_A,
          pumpUrl: 'https://zora.co/coin/base:0x1111111111111111111111111111111111111111',
        }),
      ),
    ).toBe('eth')
  })
})

describe('buildAgentLeaderboard', () => {
  const coins = [
    coin({ mint: SOL_MINT, launcher: LAUNCHER_A, agent: { name: 'DeskCat' } }),
    coin({ mint: 'So22222222222222222222222222222222222222222', launcher: LAUNCHER_A }),
    coin({
      mint: ETH_MINT,
      launcher: LAUNCHER_B,
      pumpUrl: 'https://zora.co/coin/base:0x1111111111111111111111111111111111111111',
    }),
  ]

  it('ranks desk remits only and never invents rows or @launcher', () => {
    const board = buildAgentLeaderboard({
      coins,
      remits: [
        remit({ mint: SOL_MINT, wallet: LAUNCHER_A, amountSol: 0.001, role: 'desk', at: 100 }),
        remit({ mint: SOL_MINT, wallet: CREW_W, amountSol: 9, role: 'crew', at: 200 }),
        remit({ mint: SOL_MINT, wallet: LAUNCHER_A, amountSol: 0.0005, role: 'desk', at: 300, signature: 'later' }),
        remit({
          mint: ETH_MINT,
          wallet: LAUNCHER_B,
          amountSol: 0.02,
          role: 'desk',
          at: 50,
        }),
        remit({ mint: SOL_MINT, wallet: LAUNCHER_A, amountSol: 0, role: 'desk' }),
      ],
      identities: {
        [LAUNCHER_B]: { xHandle: '@realKol' },
      },
    })

    expect(board.ok).toBe(true)
    expect(board.empty).toBe(false)
    expect(board.emptyReason).toBeNull()
    expect(board.role).toBe('desk')
    expect(board.shareBps).toBe(1500)
    expect(board.disclaimer).toBe(AGENT_LEADERBOARD_DISCLAIMER)
    expect(board.rows).toHaveLength(2)
    expect(board.rows[0]?.wallet).toBe(LAUNCHER_A)
    expect(board.rows[0]?.earnedSol).toBeCloseTo(0.0015)
    expect(board.rows[0]?.earnedEth).toBe(0)
    expect(board.rows[0]?.coinsLaunched).toBe(2)
    expect(board.rows[0]?.agentName).toBe('DeskCat')
    expect(board.rows[0]?.xHandle).toBeNull()
    expect(board.rows[0]?.lastPayoutSignature).toBe('later')
    expect(board.rows[1]?.wallet).toBe(LAUNCHER_B)
    expect(board.rows[1]?.earnedEth).toBeCloseTo(0.02)
    expect(board.rows[1]?.earnedSol).toBe(0)
    expect(board.rows[1]?.xHandle).toBe('realKol')
    expect(JSON.stringify(board.rows)).not.toMatch(/@launcher/)
    expect(board.rows.every((r) => r.earnedSol > 0 || r.earnedEth > 0)).toBe(true)
  })

  it('returns an honest empty board when the tape has no desk remits', () => {
    const board = buildAgentLeaderboard({
      coins,
      remits: [remit({ mint: SOL_MINT, wallet: CREW_W, amountSol: 1, role: 'crew' })],
    })
    expect(board.empty).toBe(true)
    expect(board.rows).toEqual([])
    expect(board.emptyReason).toMatch(/No role=desk remits/)
  })
})

describe('agentEarnedForMint', () => {
  it('returns null when this mint has no desk remits', () => {
    expect(
      agentEarnedForMint({
        mint: SOL_MINT,
        coin: coin({ mint: SOL_MINT, launcher: LAUNCHER_A }),
        remits: [remit({ mint: SOL_MINT, wallet: CREW_W, amountSol: 1, role: 'crew' })],
      }),
    ).toBeNull()
  })

  it('sums desk remits for the mint only', () => {
    const earned = agentEarnedForMint({
      mint: SOL_MINT,
      coin: coin({ mint: SOL_MINT, launcher: LAUNCHER_A, agent: { name: 'DeskCat' } }),
      remits: [
        remit({ mint: SOL_MINT, wallet: LAUNCHER_A, amountSol: 0.001, role: 'desk', at: 10 }),
        remit({ mint: SOL_MINT, wallet: LAUNCHER_A, amountSol: 0.002, role: 'desk', at: 20, signature: 'last' }),
        remit({ mint: ETH_MINT, wallet: LAUNCHER_A, amountSol: 9, role: 'desk' }),
      ],
    })
    expect(earned?.earnedSol).toBeCloseTo(0.003)
    expect(earned?.earnedEth).toBe(0)
    expect(earned?.remitCount).toBe(2)
    expect(earned?.lastPayoutSignature).toBe('last')
    expect(earned?.agentName).toBe('DeskCat')
  })
})
