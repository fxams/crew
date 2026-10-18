import type { AgentEarnedOnCoin, AgentLeaderboardRow } from './api'
import { formatSol } from './format-sol'
import { kolProfilePath } from './routes'

export function shortWallet(wallet: string): string {
  const w = (wallet || '').trim()
  if (w.length < 10) return w || '—'
  return `${w.slice(0, 4)}…${w.slice(-4)}`
}

export function agentBoardIdentity(row: {
  wallet: string
  agentName?: string | null
  xHandle?: string | null
}): { title: string; subtitle: string; href: string | null; initial: string } {
  const handle = (row.xHandle || '').replace(/^@+/, '').trim()
  const name = (row.agentName || '').trim()
  const walletShort = shortWallet(row.wallet)
  if (handle) {
    return {
      title: name || `@${handle}`,
      subtitle: `@${handle}`,
      href: kolProfilePath(handle),
      initial: (name || handle).slice(0, 1).toUpperCase(),
    }
  }
  if (name) {
    return {
      title: name,
      subtitle: walletShort,
      href: null,
      initial: name.slice(0, 1).toUpperCase(),
    }
  }
  return {
    title: walletShort,
    subtitle: 'launcher wallet',
    href: null,
    initial: (walletShort.slice(0, 1) || '?').toUpperCase(),
  }
}

export function formatAgentFees(row: Pick<AgentLeaderboardRow, 'earnedSol' | 'earnedEth'>): string {
  const parts: string[] = []
  if (row.earnedSol > 0) parts.push(`${formatSol(row.earnedSol)} SOL`)
  if (row.earnedEth > 0) parts.push(`${formatSol(row.earnedEth)} ETH`)
  return parts.join(' · ')
}

export function formatPayoutDay(at: number | null | undefined): string | null {
  if (!at || !Number.isFinite(at)) return null
  return new Date(at).toISOString().slice(0, 10)
}

export function coinsLaunchedLabel(n: number): string {
  if (!(n > 0)) return '0 coins'
  return n === 1 ? '1 coin' : `${n} coins`
}

export function hasAgentEarned(earned: AgentEarnedOnCoin | null | undefined): earned is AgentEarnedOnCoin {
  if (!earned) return false
  return earned.earnedSol > 0 || earned.earnedEth > 0
}
