import { MODE_DESK_BPS } from './config'
import { DEFAULT_BUYBACK, DEFAULT_RAID_QUESTS } from './edges'
import type { CoinRecord, RemitRecord } from './types'

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function jitter(base: number, spread = 0.35) {
  return base * (1 - spread + Math.random() * spread * 2)
}

/**
 * Simulate creator-fee accrual and split to crew (demo / local tape).
 * Desk reserve (buyback/raid) is recorded as a separate @desk line.
 */
export function simulateFeeAccrual(
  coin: CoinRecord,
  totalFeeSol = jitter(0.045),
): RemitRecord[] {
  const fee = Math.max(0.005, Number(totalFeeSol.toFixed(4)))
  const deskBps = MODE_DESK_BPS[coin.mode]
  const deskSol = Number(((fee * deskBps) / 10_000).toFixed(4))
  const crewPool = fee - deskSol
  const now = Number(new Date())
  const out: RemitRecord[] = []

  if (deskSol > 0) {
    out.push({
      id: id('remit'),
      mint: coin.mint,
      ticker: coin.ticker,
      handle: coin.mode === 'raid' ? '@raid' : '@buyback',
      wallet: coin.launcher === 'demo' ? '' : coin.launcher,
      amountSol: deskSol,
      mode: coin.mode,
      at: now,
      network: coin.network,
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
      network: coin.network,
    })
  }

  return out
}

/** Simulate a dip-rule fire from the buyback reserve. */
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
    wallet: coin.launcher === 'demo' ? '' : coin.launcher,
    amountSol: amount,
    mode: 'buyback',
    at: Number(new Date()),
    network: coin.network,
  }
}

/** Simulate a raid quest payout from the raid pool. */
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
    network: coin.network,
    signature: `quest:${quest.id}`,
  }
}

export function solscanTxUrl(signature: string) {
  if (!signature || signature === 'seed' || signature.startsWith('quest:')) return null
  return `https://solscan.io/tx/${signature}`
}

export function solscanTokenUrl(mint: string) {
  if (!mint || mint.startsWith('Crew')) return null
  return `https://solscan.io/token/${mint}`
}
