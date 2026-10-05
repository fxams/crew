import { PublicKey } from '@solana/web3.js'
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { feeSharingConfigPda, isSharingConfigEditable } from '@pump-fun/pump-sdk'
import type { WalletContextState } from '@solana/wallet-adapter-react'
import { PUMP_COIN_URL } from '../config'
import type { CoinRecord, CrewMember, DeskMode } from '../types'
import { buildCrewShareholders } from '../validation'
import { formatRpcError, getConnection, getLatestBlockhashSafe, getPumpSdk } from './connection'
import { sendInstructions } from './send'

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export async function feeSharingConfigExists(mintStr: string): Promise<boolean> {
  const mint = new PublicKey(mintStr)
  const connection = getConnection()
  const info = await connection.getAccountInfo(feeSharingConfigPda(mint))
  return Boolean(info)
}

export async function distributeCreatorFees(mintStr: string, wallet: WalletContextState) {
  if (!wallet.publicKey || !wallet.sendTransaction) {
    throw new Error('Connect a wallet to crank remits.')
  }

  const mint = new PublicKey(mintStr)
  const sdk = getPumpSdk()
  const connection = getConnection()
  const sharingConfigAddress = feeSharingConfigPda(mint)
  const accountInfo = await connection.getAccountInfo(sharingConfigAddress)
  if (!accountInfo) {
    throw new Error('No fee-sharing config on this mint yet. Wire crew fees first.')
  }
  const sharingConfig = sdk.decodeSharingConfig(accountInfo)

  const ix = await sdk.distributeCreatorFeesV2({
    mint,
    sharingConfig,
    sharingConfigAddress,
    quoteMint: NATIVE_MINT,
    payer: wallet.publicKey,
    shouldInitializeAta: true,
    quoteTokenProgram: TOKEN_PROGRAM_ID,
  })

  return sendInstructions({ wallet, ixs: [ix], attempts: 2 })
}

export type WireFeesOpts = {
  mint: string
  mode: DeskMode
  crew: CrewMember[]
  wallet: WalletContextState
  /** Existing coin fields when adopting / repairing a board row. */
  coin?: Partial<CoinRecord> & Pick<CoinRecord, 'name' | 'ticker'>
}

export type WireFeesResult = {
  feeShareSignature: string
  coin: CoinRecord
}

export type LockHolderKolOpts = {
  mint: string
  mode: DeskMode
  wallet: WalletContextState
  shareholders: { wallet: string; bps: number; handle: string; role: 'crew' | 'desk' }[]
  crew: CrewMember[]
  coin?: Partial<CoinRecord> & Pick<CoinRecord, 'name' | 'ticker'>
}

/**
 * Finalize fee-share once with holder-KOL shareholders.
 * Pump revokes admin after updateFeeSharesV2 — this cannot be re-run.
 */
export async function lockHolderKolFeeShares(
  opts: LockHolderKolOpts,
): Promise<WireFeesResult> {
  const { wallet } = opts
  if (!wallet.publicKey || !wallet.sendTransaction) {
    throw new Error('Connect a wallet to lock holder KOLs.')
  }
  if (!opts.shareholders.length) {
    throw new Error('No KOL holders matched in the top 20 — nothing to lock.')
  }

  let mint: PublicKey
  try {
    mint = new PublicKey(opts.mint.trim())
  } catch {
    throw new Error('Invalid mint address.')
  }

  const launcher = wallet.publicKey
  await getLatestBlockhashSafe('confirmed')
  const sdk = getPumpSdk()
  const connection = getConnection()
  const sharingPda = feeSharingConfigPda(mint)
  const existing = await connection.getAccountInfo(sharingPda)

  const ixs = []
  if (!existing) {
    ixs.push(
      await sdk.createFeeSharingConfig({
        creator: launcher,
        mint,
        pool: null,
      }),
    )
  } else {
    const sharing = sdk.decodeSharingConfig(existing)
    if (!isSharingConfigEditable({ sharingConfig: sharing })) {
      throw new Error(
        'Fee-share already finalized on this mint. Pump allows one shareholder lock only.',
      )
    }
  }

  const currentShareholders = existing
    ? sdk.decodeSharingConfig(existing).shareholders.map((s) => s.address)
    : [launcher]

  const newShareholders = opts.shareholders.map((s) => ({
    address: new PublicKey(s.wallet),
    shareBps: s.bps,
  }))

  const total = newShareholders.reduce((s, r) => s + r.shareBps, 0)
  if (total !== 10_000) {
    throw new Error(`Shareholders must total 10000 bps (got ${total}).`)
  }

  ixs.push(
    await sdk.updateFeeSharesV2({
      authority: launcher,
      mint,
      currentShareholders,
      newShareholders,
      quoteMint: NATIVE_MINT,
      quoteTokenProgram: TOKEN_PROGRAM_ID,
    }),
  )

  let feeShareSignature: string
  try {
    feeShareSignature = await sendInstructions({ wallet, ixs, attempts: 2 })
  } catch (err) {
    throw new Error(
      formatRpcError(err instanceof Error ? err : new Error('Lock holder KOLs failed.')),
    )
  }

  const launchedAt = opts.coin?.launchedAt ?? Number(new Date())
  const mintStr = mint.toBase58()
  const ticker = (opts.coin?.ticker || 'COIN').toUpperCase().replace(/^\$/, '')

  const coin: CoinRecord = {
    id: opts.coin?.id || id('coin'),
    mint: mintStr,
    name: opts.coin?.name || ticker,
    ticker,
    vibe: opts.coin?.vibe || '',
    mode: opts.mode,
    crew: opts.crew.map((m) => ({ ...m })),
    signature: opts.coin?.signature || feeShareSignature,
    feeShareSignature,
    launchedAt,
    launcher: opts.coin?.launcher || launcher.toBase58(),
    pumpUrl: opts.coin?.pumpUrl || PUMP_COIN_URL(mintStr),
    buybackRule: opts.coin?.buybackRule,
    raidQuests: opts.coin?.raidQuests,
    agent: opts.coin?.agent,
    holderKol: true,
  }

  return { feeShareSignature, coin }
}

/**
 * createFeeSharingConfig + updateFeeSharesV2 for a mint that already exists.
 * Required when launch create landed but the fee-share tx never confirmed —
 * without this, creator fees stay with the launcher only and crew is unpaid.
 */
export async function wireCrewFeeShares(opts: WireFeesOpts): Promise<WireFeesResult> {
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

  const launcher = wallet.publicKey
  const shareholders = buildCrewShareholders(opts.crew, opts.mode, launcher.toBase58())

  await getLatestBlockhashSafe('confirmed')
  const sdk = getPumpSdk()
  const connection = getConnection()
  const sharingPda = feeSharingConfigPda(mint)
  const existing = await connection.getAccountInfo(sharingPda)

  const ixs = []
  if (!existing) {
    ixs.push(
      await sdk.createFeeSharingConfig({
        creator: launcher,
        mint,
        pool: null,
      }),
    )
  }

  const currentShareholders = existing
    ? sdk.decodeSharingConfig(existing).shareholders.map((s) => s.address)
    : [launcher]

  const newShareholders = shareholders.map((s) => ({
    address: new PublicKey(s.wallet),
    shareBps: s.bps,
  }))

  ixs.push(
    await sdk.updateFeeSharesV2({
      authority: launcher,
      mint,
      currentShareholders,
      newShareholders,
      quoteMint: NATIVE_MINT,
      quoteTokenProgram: TOKEN_PROGRAM_ID,
    }),
  )

  let feeShareSignature: string
  try {
    feeShareSignature = await sendInstructions({ wallet, ixs, attempts: 2 })
  } catch (err) {
    throw new Error(formatRpcError(err instanceof Error ? err : new Error('Wire fees failed.')))
  }

  const launchedAt = opts.coin?.launchedAt ?? Number(new Date())
  const mintStr = mint.toBase58()
  const ticker = (opts.coin?.ticker || 'COIN').toUpperCase().replace(/^\$/, '')

  const coin: CoinRecord = {
    id: opts.coin?.id || id('coin'),
    mint: mintStr,
    name: opts.coin?.name || ticker,
    ticker,
    vibe: opts.coin?.vibe || '',
    mode: opts.mode,
    crew: opts.crew.map((m) => ({ ...m })),
    signature: opts.coin?.signature || feeShareSignature,
    feeShareSignature,
    launchedAt,
    launcher: opts.coin?.launcher || launcher.toBase58(),
    pumpUrl: opts.coin?.pumpUrl || PUMP_COIN_URL(mintStr),
    buybackRule: opts.coin?.buybackRule,
    raidQuests: opts.coin?.raidQuests,
    agent: opts.coin?.agent,
  }

  return { feeShareSignature, coin }
}
