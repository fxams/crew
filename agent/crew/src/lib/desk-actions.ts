import { MODE_DESK_BPS, PLATFORM_BUYBACK_BPS } from './config'
import { DEFAULT_BUYBACK, DEFAULT_RAID_QUESTS } from './edges'
import type { CoinRecord, RemitRecord } from './types'

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function jitter(base: number, spread = 0.35) {
  return base * (1 - spread + Math.random() * spread * 2)
}

/**
 * Project a fee accrual split onto the local tape (does not move on-chain funds).
 * Use Distribute / crank for real remits.
 */
export function simulateFeeAccrual(
  coin: CoinRecord,
  totalFeeSol = jitter(0.045),
): RemitRecord[] {
  const fee = Math.max(0.005, Number(totalFeeSol.toFixed(4)))
  const platformBps = PLATFORM_BUYBACK_BPS
  const deskBps = MODE_DESK_BPS[coin.mode]
  const platformSol = Number(((fee * platformBps) / 10_000).toFixed(4))
  const deskSol = Number(((fee * deskBps) / 10_000).toFixed(4))
  const crewPool = Number((fee - platformSol - deskSol).toFixed(4))
  const now = Number(new Date())
  const out: RemitRecord[] = []

  if (platformSol > 0) {
    out.push({
      id: id('remit'),
      mint: coin.mint,
      ticker: coin.ticker,
      handle: '@crew-buyback',
      wallet: '',
      amountSol: platformSol,
      mode: coin.mode,
      at: now,
    })
  }

  if (deskSol > 0) {
    out.push({
      id: id('remit'),
      mint: coin.mint,
      ticker: coin.ticker,
      handle: coin.mode === 'raid' ? '@raid' : '@buyback',
      wallet: coin.launcher,
      amountSol: deskSol,
      mode: coin.mode,
      at: now + 20,
    })
  }

  const raw = coin.crew.map((m) => ({
    member: m,
    amount: Number(((crewPool * m.share) / 100).toFixed(4)),
  }))
  const sum = raw.reduce((s, r) => s + r.amount, 0)
  if (raw.length && Math.abs(sum - crewPool) > 0.00005) {
    const largest = raw.reduce((a, b) => (a.amount >= b.amount ? a : b))
    largest.amount = Number((largest.amount + (crewPool - sum)).toFixed(4))
  }

  for (const [i, row] of raw.entries()) {
    if (row.amount <= 0) continue
    out.push({
      id: id('remit'),
      mint: coin.mint,
      ticker: coin.ticker,
      handle: row.member.handle,
      wallet: row.member.wallet,
      amountSol: row.amount,
      mode: coin.mode,
      at: now + (i + 1) * 40,
    })
  }

  return out
}

/** Project a dip-rule fire onto the local tape. */
export function simulateBuybackFire(coin: CoinRecord): RemitRecord {
  if (coin.mode !== 'buyback') {
    throw new Error('Buyback fire only works on Dip Buyback coins.')
  }
  const rule = coin.buybackRule ?? DEFAULT_BUYBACK
  const amount = Number(
    Math.min(rule.maxSolPerFire, jitter(rule.maxSolPerFire * 0.55, 0.25)).toFixed(4),
  )
  return {
    id: id('buyback'),
    mint: coin.mint,
    ticker: coin.ticker,
    handle: '@buyback',
    wallet: coin.launcher,
    amountSol: amount,
    mode: 'buyback',
    at: Number(new Date()),
  }
}

/** Project a raid quest payout onto the local tape. */
export function simulateRaidClaim(coin: CoinRecord, questId?: string): RemitRecord {
  if (coin.mode !== 'raid') {
    throw new Error('Raid claims only work on Raid Pool coins.')
  }
  const quests = coin.raidQuests ?? DEFAULT_RAID_QUESTS
  const quest = quests.find((q) => q.id === questId) ?? quests[0]
  if (!quest) throw new Error('No raid quests configured.')

  const pot = jitter(0.08)
  const amount = Number(((pot * quest.bountyBps) / 10_000).toFixed(4))
  const winner = coin.crew[Math.floor(Math.random() * coin.crew.length)] ?? coin.crew[0]

  return {
    id: id('raid'),
    mint: coin.mint,
    ticker: coin.ticker,
    handle: winner.handle,
    wallet: winner.wallet,
    amountSol: Math.max(0.001, amount),
    mode: 'raid',
    at: Number(new Date()),
    signature: `quest:${quest.id}`,
  }
}

export function solscanTxUrl(signature: string) {
  if (!signature || signature.startsWith('quest:')) return null
  return `https://solscan.io/tx/${signature}`
}

export function solscanTokenUrl(mint: string) {
  if (!mint) return null
  return `https://solscan.io/token/${mint}`
}
