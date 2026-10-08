import type { CoinRecord, RemitRecord } from '../types'

const SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{80,90}$/

export function isChainRemit(raw: RemitRecord): boolean {
  if (raw.amountSol <= 0) return false
  if (!raw.signature || !SIG_RE.test(raw.signature)) return false
  if (raw.signature.startsWith('quest:')) return false
  return true
}

export function walletToHandle(coin: CoinRecord, wallet: string): string {
  const member = coin.crew.find((m) => m.wallet === wallet)
  if (member) return member.handle
  if (wallet === coin.launcher) {
    if (coin.mode === 'agent') {
      const name = (coin.agent?.name || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '').slice(0, 24)
      return name.length >= 2 ? `@${name}` : '@launcher'
    }
    if (coin.mode === 'raid') return '@raid'
    if (coin.mode === 'buyback') return '@buyback'
    return '@desk'
  }
  if (wallet.length >= 8) return `@${wallet.slice(0, 4)}…${wallet.slice(-4)}`
  return `@${wallet.slice(0, 4)}`
}
