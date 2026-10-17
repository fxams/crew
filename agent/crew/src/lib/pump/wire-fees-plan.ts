import { PublicKey, type TransactionInstruction } from '@solana/web3.js'
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { feeSharingConfigPda, isSharingConfigEditable } from '@pump-fun/pump-sdk'
import { assertKnownWireFeePrograms } from './wire-fees-allowlist'
import type { WalletContextState } from '@solana/wallet-adapter-react'
import type { CoinRecord, CrewMember, DeskMode } from '../types'
import { buildCrewShareholders } from '../validation'
import { getConnection, getLatestBlockhashSafe, getOnlineSdk, getPumpSdk } from './connection'

export type WireFeeShareRecipient = {
  wallet: string
  bps: number
  handle: string
  role: string
}

export type WireFeeSharePlan = {
  mint: string
  ticker: string
  feePayer: string
  /** Pump bonding-curve creator — must sign fee-share updates. */
  pumpCreator: string
  createsSharingConfig: boolean
  instructionLabels: string[]
  programIds: string[]
  recipients: WireFeeShareRecipient[]
  ixs: TransactionInstruction[]
  /** Human-readable lines for the confirm sheet. */
  summaryLines: string[]
}

export type BuildWirePlanOpts = {
  mint: string
  mode: DeskMode
  crew: CrewMember[]
  wallet: WalletContextState
  coin?: Partial<CoinRecord> & Pick<CoinRecord, 'name' | 'ticker'>
}

function uniqueProgramIds(ixs: TransactionInstruction[]): string[] {
  const set = new Set<string>()
  for (const ix of ixs) {
    set.add(ix.programId.toBase58())
  }
  return [...set].sort()
}

/**
 * Build Pump fee-share instructions (no send). Validates the connected wallet
 * is the on-chain creator and only touches Pump's fee program.
 */
export async function buildWireCrewFeeSharePlan(opts: BuildWirePlanOpts): Promise<WireFeeSharePlan> {
  const { wallet } = opts
  if (!wallet.publicKey || !wallet.sendTransaction) {
    throw new Error('Connect a wallet to wire crew fees.')
  }

  let mint: PublicKey
  try {
    mint = new PublicKey(opts.mint.trim())
  } catch {
    throw new Error('Invalid mint address.')
  }

  const feePayer = wallet.publicKey
  const online = getOnlineSdk()
  let pumpCreator: PublicKey
  try {
    const curve = await online.fetchBondingCurve(mint)
    pumpCreator = curve.creator
  } catch (err) {
    throw new Error(
      err instanceof Error
        ? `Could not load Pump bonding curve for this mint: ${err.message}`
        : 'Could not load Pump bonding curve for this mint.',
    )
  }

  if (!feePayer.equals(pumpCreator)) {
    const recorded = opts.coin?.launcher?.trim()
    throw new Error(
      recorded && recorded !== feePayer.toBase58()
        ? `Connect the launcher wallet (${recorded.slice(0, 4)}…${recorded.slice(-4)}) — fee-share authority is the Pump creator, not ${feePayer.toBase58().slice(0, 4)}…${feePayer.toBase58().slice(-4)}.`
        : `Only the Pump creator (${pumpCreator.toBase58().slice(0, 4)}…${pumpCreator.toBase58().slice(-4)}) can wire fees. Switch wallets and retry.`,
    )
  }

  const shareholders = buildCrewShareholders(opts.crew, opts.mode, {
    deskWallet: feePayer.toBase58(),
  })

  await getLatestBlockhashSafe('confirmed')
  const sdk = getPumpSdk()
  const connection = getConnection()
  const sharingPda = feeSharingConfigPda(mint)
  const existing = await connection.getAccountInfo(sharingPda)

  const instructionLabels: string[] = []
  const ixs: TransactionInstruction[] = []
  let createsSharingConfig = false

  if (!existing) {
    createsSharingConfig = true
    instructionLabels.push('Pump: create fee-sharing config (one-time)')
    ixs.push(
      await sdk.createFeeSharingConfig({
        creator: feePayer,
        mint,
        pool: null,
      }),
    )
  } else {
    const sharing = sdk.decodeSharingConfig(existing)
    if (!isSharingConfigEditable({ sharingConfig: sharing })) {
      throw new Error('Fee-share already finalized on this mint — nothing to wire.')
    }
    instructionLabels.push('Pump: update existing editable fee-share')
  }

  const currentShareholders = existing
    ? sdk.decodeSharingConfig(existing).shareholders.map((s) => s.address)
    : [feePayer]

  const newShareholders = shareholders.map((s) => ({
    address: new PublicKey(s.wallet),
    shareBps: s.bps,
  }))

  instructionLabels.push(
    `Pump: lock creator fees to ${newShareholders.length} wallets (updateFeeSharesV2)`,
  )

  ixs.push(
    await sdk.updateFeeSharesV2({
      authority: feePayer,
      mint,
      currentShareholders,
      newShareholders,
      quoteMint: NATIVE_MINT,
      quoteTokenProgram: TOKEN_PROGRAM_ID,
    }),
  )

  const programIds = uniqueProgramIds(ixs)
  assertKnownWireFeePrograms(programIds)

  const ticker = (opts.coin?.ticker || 'COIN').toUpperCase().replace(/^\$/, '')
  const recipients: WireFeeShareRecipient[] = shareholders.map((s) => ({
    wallet: s.wallet,
    bps: s.bps,
    handle: s.handle,
    role: s.role,
  }))

  const summaryLines = [
    `Mint $${ticker} (${mint.toBase58().slice(0, 4)}…${mint.toBase58().slice(-4)})`,
    `You (Pump creator) authorize Pump.fun to split future creator fees — not a token transfer.`,
    createsSharingConfig
      ? 'Step 1: create on-chain fee-sharing config for this mint.'
      : 'Fee-sharing config already exists; updating shareholders only.',
    `Step 2: lock shares to ${recipients.length} wallets (crew + desk + CrewPay treasury).`,
    'No address lookup tables, no durable nonce, no extra signatures — only your wallet signs.',
    ...recipients.map(
      (r) => `${(r.bps / 100).toFixed(2)}% → ${r.handle || r.role} (${r.wallet.slice(0, 4)}…${r.wallet.slice(-4)})`,
    ),
  ]

  return {
    mint: mint.toBase58(),
    ticker,
    feePayer: feePayer.toBase58(),
    pumpCreator: pumpCreator.toBase58(),
    createsSharingConfig,
    instructionLabels,
    programIds,
    recipients,
    ixs,
    summaryLines,
  }
}
