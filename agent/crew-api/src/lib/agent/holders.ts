/**
 * Server-side top-holder scan ∩ KOL directory for Holder-KOL lock.
 */

import { PublicKey } from '@solana/web3.js'
import { createRequire } from 'node:module'
import { getKolByWallet } from '../kols.js'
import {
  MODE_DESK_BPS,
  PLATFORM_BUYBACK_BPS,
  getPlatformBuybackWallet,
  type DeskMode,
} from './constants.js'
import { PumpSdk } from './pump.js'
import { getConnection } from './send.js'

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pump = require('@pump-fun/pump-sdk') as typeof import('@pump-fun/pump-sdk')
const { bondingCurvePda, feeSharingConfigPda, pumpPoolAuthorityPda, isSharingConfigEditable } =
  pump

const TOP_HOLDER_ACCOUNTS = 20
const PUMP_MAX_SHAREHOLDERS = 10

export type HolderKolProposal = {
  matches: {
    wallet: string
    handle: string
    pump: string
    rank: number
    followers: number
    uiAmount: number
    share: number
    bps: number
  }[]
  shareholders: { wallet: string; bps: number; handle: string; role: string }[]
  crew: { handle: string; wallet: string; share: number; hireRole?: string }[]
  deskBps: number
  platformBps: number
  scannedHolders: number
  editable: boolean
}

async function vaultOwners(mint: PublicKey): Promise<Set<string>> {
  const set = new Set<string>()
  try {
    set.add(bondingCurvePda(mint).toBase58())
  } catch {
    /* ignore */
  }
  try {
    set.add(feeSharingConfigPda(mint).toBase58())
  } catch {
    /* ignore */
  }
  try {
    set.add(pumpPoolAuthorityPda(mint).toBase58())
  } catch {
    /* ignore */
  }
  return set
}

export async function proposeHolderKolFromChain(
  mintStr: string,
  mode: DeskMode,
  launcher: string,
): Promise<HolderKolProposal> {
  const mint = new PublicKey(mintStr)
  const connection = getConnection()
  const sdk = new PumpSdk()
  const vaults = await vaultOwners(mint)

  const largest = await connection.getTokenLargestAccounts(mint)
  const rows: { owner: string; uiAmount: number }[] = []
  for (const acc of largest.value.slice(0, TOP_HOLDER_ACCOUNTS)) {
    const info = await connection.getParsedAccountInfo(acc.address)
    const data = info.value?.data
    if (!data || typeof data === 'string' || !('parsed' in data)) continue
    const parsed = data.parsed as {
      info?: { owner?: string; tokenAmount?: { uiAmount?: number } }
    }
    const owner = parsed.info?.owner
    const uiAmount = Number(parsed.info?.tokenAmount?.uiAmount || 0)
    if (!owner || vaults.has(owner) || uiAmount <= 0) continue
    rows.push({ owner, uiAmount })
  }

  const matches: HolderKolProposal['matches'] = []
  for (const row of rows) {
    const kol = await getKolByWallet(row.owner)
    if (!kol) continue
    matches.push({
      wallet: row.owner,
      handle: `@${kol.x || kol.pump}`,
      pump: kol.pump,
      rank: kol.rank,
      followers: kol.followers,
      uiAmount: row.uiAmount,
      share: 0,
      bps: 0,
    })
  }

  const platformBps = PLATFORM_BUYBACK_BPS
  const deskBps = MODE_DESK_BPS[mode]
  const crewPoolBps = 10_000 - platformBps - deskBps
  const maxKolSlots = PUMP_MAX_SHAREHOLDERS - (deskBps > 0 ? 2 : 1)
  const selected = matches.slice(0, Math.max(0, maxKolSlots))
  const totalUi = selected.reduce((s, m) => s + m.uiAmount, 0) || 1

  let assigned = 0
  for (let i = 0; i < selected.length; i += 1) {
    const m = selected[i]!
    if (i === selected.length - 1) {
      m.bps = crewPoolBps - assigned
    } else {
      m.bps = Math.floor((crewPoolBps * m.uiAmount) / totalUi)
      assigned += m.bps
    }
    m.share = Math.max(1, Math.round((m.bps / crewPoolBps) * 100))
  }
  const shareSum = selected.reduce((s, m) => s + m.share, 0) || 1
  for (const m of selected) {
    m.share = Math.max(1, Math.round((m.share / shareSum) * 100))
  }
  const fix = 100 - selected.reduce((s, m) => s + m.share, 0)
  if (selected[0]) selected[0].share += fix

  const platform = getPlatformBuybackWallet()
  const shareholders: HolderKolProposal['shareholders'] = [
    { wallet: platform, bps: platformBps, handle: '@crew-buyback', role: 'platform' },
  ]
  if (deskBps > 0) {
    shareholders.push({
      wallet: launcher,
      bps: deskBps,
      handle: mode === 'raid' ? '@raid' : mode === 'buyback' ? '@buyback' : '@agent',
      role: 'desk',
    })
  }
  for (const m of selected) {
    shareholders.push({
      wallet: m.wallet,
      bps: m.bps,
      handle: m.handle,
      role: 'crew',
    })
  }

  let editable = true
  try {
    const pda = feeSharingConfigPda(mint)
    const info = await connection.getAccountInfo(pda)
    if (info) {
      const cfg = sdk.decodeSharingConfig(info)
      editable = isSharingConfigEditable({ sharingConfig: cfg })
    }
  } catch {
    editable = true
  }

  return {
    matches: selected,
    shareholders,
    crew: selected.map((m) => ({
      handle: m.handle,
      wallet: m.wallet,
      share: m.share,
      hireRole: 'kol',
    })),
    deskBps,
    platformBps,
    scannedHolders: rows.length,
    editable,
  }
}
