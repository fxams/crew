import { PublicKey } from '@solana/web3.js'
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { feeSharingConfigPda } from '@pump-fun/pump-sdk'
import type { WalletContextState } from '@solana/wallet-adapter-react'
import { PUMP_COIN_URL } from '../config'
import type { CoinRecord, CrewMember, DeskMode, RemitRecord } from '../types'
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
  remits: RemitRecord[]
  coin: CoinRecord
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
  const remits: RemitRecord[] = shareholders
    .filter((s) => s.role === 'crew')
    .map((s, i) => ({
      id: id('remit'),
      mint: mintStr,
      ticker,
      handle: s.handle,
      wallet: s.wallet,
      amountSol: 0,
      mode: opts.mode,
      at: launchedAt + i,
      signature: feeShareSignature,
    }))

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

  return { feeShareSignature, remits, coin }
}
