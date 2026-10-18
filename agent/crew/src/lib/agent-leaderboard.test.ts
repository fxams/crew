import { describe, expect, it } from 'vitest'
import {
  agentBoardIdentity,
  coinsLaunchedLabel,
  formatAgentFees,
  formatPayoutDay,
  hasAgentEarned,
  shortWallet,
} from './agent-leaderboard'

describe('agent leaderboard display', () => {
  it('never invents @launcher and prefers a real handle', () => {
    expect(agentBoardIdentity({ wallet: 'DeskWalletAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }).title).toBe(
      'Desk…AAAA',
    )
    expect(JSON.stringify(agentBoardIdentity({ wallet: 'DeskWalletAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }))).not.toMatch(
      /@launcher/,
    )
    expect(
      agentBoardIdentity({
        wallet: 'DeskWalletAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        agentName: 'DeskCat',
        xHandle: '@realKol',
      }),
    ).toMatchObject({ title: 'DeskCat', subtitle: '@realKol' })
  })

  it('formats only real non-zero fees', () => {
    expect(formatAgentFees({ earnedSol: 0.001492, earnedEth: 0 })).toBe('0.0015 SOL')
    expect(formatAgentFees({ earnedSol: 0, earnedEth: 0.02 })).toBe('0.02 ETH')
    expect(formatAgentFees({ earnedSol: 0, earnedEth: 0 })).toBe('')
    expect(hasAgentEarned(null)).toBe(false)
    expect(hasAgentEarned({ earnedSol: 0, earnedEth: 0 } as never)).toBe(false)
  })

  it('labels coins and payout day without fake numbers', () => {
    expect(coinsLaunchedLabel(0)).toBe('0 coins')
    expect(coinsLaunchedLabel(1)).toBe('1 coin')
    expect(coinsLaunchedLabel(4)).toBe('4 coins')
    expect(formatPayoutDay(null)).toBeNull()
    expect(formatPayoutDay(1_700_000_000_000)).toBe('2023-11-14')
    expect(shortWallet('abc')).toBe('abc')
  })
})
