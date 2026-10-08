/**
 * Agent repair / status / holder-KOL lock / crank — for post-launch recovery.
 */

import { PublicKey } from '@solana/web3.js'
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { createRequire } from 'node:module'
import { getCoin, upsertCoin, type ApiCoin } from '../coins.js'
import { MODE_DESK_BPS, PUMP_COIN_URL, type DeskMode } from './constants.js'
import { proposeHolderKolFromChain } from './holders.js'
import { OnlinePumpSdk, PumpSdk } from './pump.js'
import { getConnection, sendInstructions } from './send.js'
import { buildCrewShareholders, normalizeCrew, type Shareholder } from './shareholders.js'
import type { CrewMember } from './narrative.js'

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pump = require('@pump-fun/pump-sdk') as typeof import('@pump-fun/pump-sdk')
const { feeSharingConfigPda, isSharingConfigEditable } = pump

export type AgentStatus = {
  ok: true
  mint: string
  onBoard: boolean
  coin: ApiCoin | null
  feeConfigExists: boolean
  feeShareEditable: boolean | null
  feeShareLocked: boolean
  holderKol: boolean
  pumpUrl: string
  tip: string
}

export async function getAgentMintStatus(mintStr: string): Promise<AgentStatus> {
  const mint = new PublicKey(mintStr.trim())
  const connection = getConnection()
  const pda = feeSharingConfigPda(mint)
  const info = await connection.getAccountInfo(pda)
  const coin = await getCoin(mint.toBase58())
  let feeShareEditable: boolean | null = null
  if (info) {
    try {
      const sdk = new PumpSdk()
      const cfg = sdk.decodeSharingConfig(info)
      feeShareEditable = isSharingConfigEditable({ sharingConfig: cfg })
    } catch {
      feeShareEditable = null
    }
  }
  const feeShareLocked = Boolean(coin?.feeShareSignature) || (info != null && feeShareEditable === false)
  const holderKol = Boolean(coin?.holderKol)
  let tip =
    'Mint ready. If feeShareLocked is false, call crew_wire_fees (or desk Wire fees).'
  if (holderKol && !feeShareLocked) {
    tip = 'Holder KOL open — call crew_lock_holder_kol after holders settle, or lock from the desk.'
  } else if (feeShareLocked) {
    tip = 'Fees locked. Use crew_crank_remits to distribute creator fees to the tape.'
  } else if (!info) {
    tip = 'No fee-sharing config yet — crew_wire_fees will create + lock shareholders.'
  }

  return {
    ok: true,
    mint: mint.toBase58(),
    onBoard: Boolean(coin),
    coin,
    feeConfigExists: Boolean(info),
    feeShareEditable,
    feeShareLocked,
    holderKol,
    pumpUrl: coin?.pumpUrl || PUMP_COIN_URL(mint.toBase58()),
    tip,
  }
}

export async function wireFeesForAgent(opts: {
  mint: string
  mode: DeskMode
  /** When omitted, reuse crew stored on the board coin (post-launch repair). */
  crew?: CrewMember[]
  launcher: import('@solana/web3.js').Keypair
  name?: string
  ticker?: string
}): Promise<{
  ok: true
  feeShareSignature: string
  feeShareLocked: true
  mint: string
  coin: ApiCoin
}> {
  const mint = new PublicKey(opts.mint.trim())
  const launcher = opts.launcher
  const boardExisting = await getCoin(mint.toBase58())
  if (boardExisting && boardExisting.launcher !== launcher.publicKey.toBase58()) {
    throw new Error('x-launcher-key must match the mint launcher wallet on the board.')
  }

  const crewSource =
    opts.crew?.length
      ? opts.crew
      : (boardExisting?.crew as CrewMember[] | undefined)
  if (!crewSource?.length) {
    throw new Error(
      'Provide crew[] or launch first so the board has crew to wire (shares must total 100%).',
    )
  }
  const crew = normalizeCrew(crewSource, opts.mode)
  const shareholders = buildCrewShareholders(crew, opts.mode, {
    deskWallet: launcher.publicKey.toBase58(),
  })

  const connection = getConnection()
  const sdk = new PumpSdk()
  const online = new OnlinePumpSdk(connection)
  void online
  const sharingPda = feeSharingConfigPda(mint)
  const existing = await connection.getAccountInfo(sharingPda)

  const ixs = []
  if (!existing) {
    ixs.push(
      await sdk.createFeeSharingConfig({
        creator: launcher.publicKey,
        mint,
        pool: null,
      }),
    )
  } else {
    const cfg = sdk.decodeSharingConfig(existing)
    if (!isSharingConfigEditable({ sharingConfig: cfg })) {
      throw new Error('Fee-sharing config is already locked on-chain.')
    }
  }

  const currentShareholders = existing
    ? sdk.decodeSharingConfig(existing).shareholders.map((s) => s.address)
    : [launcher.publicKey]

  const newShareholders = shareholders.map((s: Shareholder) => ({
    address: new PublicKey(s.wallet),
    shareBps: s.bps,
  }))

  ixs.push(
    await sdk.updateFeeSharesV2({
      authority: launcher.publicKey,
      mint,
      currentShareholders,
      newShareholders,
      quoteMint: NATIVE_MINT,
      quoteTokenProgram: TOKEN_PROGRAM_ID,
    }),
  )

  const feeShareSignature = await sendInstructions({
    payer: launcher,
    ixs,
    attempts: 2,
  })

  const mintStr = mint.toBase58()
  const board = await getCoin(mintStr)
  const ticker = (opts.ticker || board?.ticker || 'COIN').toUpperCase().replace(/^\$/, '')
  const coin: ApiCoin = {
    id: board?.id || `coin_${mintStr.slice(0, 8)}`,
    mint: mintStr,
    name: opts.name || board?.name || ticker,
    ticker,
    vibe: board?.vibe || '',
    mode: opts.mode,
    crew,
    signature: board?.signature || feeShareSignature,
    feeShareSignature,
    launchedAt: board?.launchedAt || Date.now(),
    launcher: board?.launcher || launcher.publicKey.toBase58(),
    pumpUrl: board?.pumpUrl || PUMP_COIN_URL(mintStr),
    buybackRule: board?.buybackRule,
    raidQuests: board?.raidQuests,
    agent: board?.agent,
    holderKol: false,
  }
  await upsertCoin(coin)
  return { ok: true, feeShareSignature, feeShareLocked: true, mint: mintStr, coin }
}

export async function lockHolderKolForAgent(opts: {
  mint: string
  mode: DeskMode
  launcher: import('@solana/web3.js').Keypair
  name?: string
  ticker?: string
}): Promise<{
  ok: true
  feeShareSignature: string
  feeShareLocked: true
  mint: string
  proposal: Awaited<ReturnType<typeof proposeHolderKolFromChain>>
  coin: ApiCoin
}> {
  const mint = new PublicKey(opts.mint.trim())
  const launcher = opts.launcher
  const board = await getCoin(mint.toBase58())
  if (board && board.launcher !== launcher.publicKey.toBase58()) {
    throw new Error('x-launcher-key must match the mint launcher wallet on the board.')
  }

  const proposal = await proposeHolderKolFromChain(
    mint.toBase58(),
    opts.mode,
    launcher.publicKey.toBase58(),
  )
  if (!proposal.matches.length) {
    throw new Error('No KOL holders matched in the top holders — wait for holders or Autohire instead.')
  }
  if (!proposal.editable) {
    throw new Error('Fee-sharing config is already locked — cannot run Holder KOL lock.')
  }

  const connection = getConnection()
  const sdk = new PumpSdk()
  const sharingPda = feeSharingConfigPda(mint)
  const existing = await connection.getAccountInfo(sharingPda)
  const ixs = []
  if (!existing) {
    ixs.push(
      await sdk.createFeeSharingConfig({
        creator: launcher.publicKey,
        mint,
        pool: null,
      }),
    )
  }
  const currentShareholders = existing
    ? sdk.decodeSharingConfig(existing).shareholders.map((s) => s.address)
    : [launcher.publicKey]

  ixs.push(
    await sdk.updateFeeSharesV2({
      authority: launcher.publicKey,
      mint,
      currentShareholders,
      newShareholders: proposal.shareholders.map((s) => ({
        address: new PublicKey(s.wallet),
        shareBps: s.bps,
      })),
      quoteMint: NATIVE_MINT,
      quoteTokenProgram: TOKEN_PROGRAM_ID,
    }),
  )

  const feeShareSignature = await sendInstructions({
    payer: launcher,
    ixs,
    attempts: 2,
  })

  const mintStr = mint.toBase58()
  const ticker = (opts.ticker || board?.ticker || 'COIN').toUpperCase().replace(/^\$/, '')
  const coin: ApiCoin = {
    id: board?.id || `coin_${mintStr.slice(0, 8)}`,
    mint: mintStr,
    name: opts.name || board?.name || ticker,
    ticker,
    vibe: board?.vibe || '',
    mode: opts.mode,
    crew: proposal.crew,
    signature: board?.signature || feeShareSignature,
    feeShareSignature,
    launchedAt: board?.launchedAt || Date.now(),
    launcher: board?.launcher || launcher.publicKey.toBase58(),
    pumpUrl: board?.pumpUrl || PUMP_COIN_URL(mintStr),
    buybackRule: board?.buybackRule,
    raidQuests: board?.raidQuests,
    agent: board?.agent,
    holderKol: true,
  }
  await upsertCoin(coin)
  return { ok: true, feeShareSignature, feeShareLocked: true, mint: mintStr, proposal, coin }
}

export async function crankRemitsForAgent(opts: {
  mint: string
  /** Fee payer — distributeCreatorFeesV2 is permissionless; any funded wallet works. */
  payer: import('@solana/web3.js').Keypair
}): Promise<{ ok: true; signature: string; mint: string; swept: boolean }> {
  const mint = new PublicKey(opts.mint.trim())
  const connection = getConnection()
  const sharingConfigAddress = feeSharingConfigPda(mint)
  const accountInfo = await connection.getAccountInfo(sharingConfigAddress)
  if (!accountInfo) {
    throw new Error('No fee-sharing config — wire fees first.')
  }
  // OnlinePumpSdk prepends transferCreatorFeesToPump / sweep when bonding_curve
  // still holds unswept creator_fee (avoids CreatorFeesNotSwept 6095).
  const online = new OnlinePumpSdk(connection)
  try {
    const minFee = await online.getMinimumDistributableFee(mint, opts.payer.publicKey, {
      quoteMint: NATIVE_MINT,
    })
    if (minFee?.canDistribute === false) {
      throw new Error(
        'No distributable creator fees yet (below minimum or already drained).',
      )
    }
  } catch (err) {
    if (err instanceof Error && /No distributable/.test(err.message)) throw err
    /* view sim optional — still try build+send */
  }
  const built = await online.buildDistributeCreatorFeesInstructions(mint, {
    quoteMint: NATIVE_MINT,
    quoteTokenProgram: TOKEN_PROGRAM_ID,
    payer: opts.payer.publicKey,
  })
  if (!built.instructions.length) {
    throw new Error('No distribute instructions built for this mint.')
  }
  const signature = await sendInstructions({
    payer: opts.payer,
    ixs: built.instructions,
    attempts: 2,
  })
  return {
    ok: true,
    signature,
    mint: mint.toBase58(),
    swept: built.instructions.length > 1,
  }
}

export function deskModeOrDefault(mode?: string): DeskMode {
  if (mode === 'split' || mode === 'buyback' || mode === 'raid' || mode === 'agent') return mode
  return 'agent'
}

export { MODE_DESK_BPS }
