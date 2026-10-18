import { PublicKey, type TransactionInstruction } from '@solana/web3.js'
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import BN from 'bn.js'
import { OnlinePumpSdk, PumpSdk, getBuyTokenAmountFromSolAmount } from './pump.js'
import { getConnection, loadLookupTables } from './send.js'
import { PUMP_COIN_URL } from './constants.js'
import type { LaunchPlatform } from './platforms.js'
import { resolveUnsignedPumpMint } from './mint-required.js'
import {
  FEES_LOCKED_AT_LAUNCH_PAIR,
  FEES_LOCKED_AT_LAUNCH_SINGLE,
  chooseUnsignedPumpLockPath,
  compileUnsignedV0,
  type UnsignedPumpLockPath,
} from './unsigned-atomic.js'

export type UnsignedStepKind =
  | 'create'
  | 'lock'
  | 'create_and_lock'
  | 'create_and_buy'
  | 'fee_share_config'
  | 'split'
  | 'zora_create'
  | 'clanker_deploy'
  | 'vibevibe_deploy'
  | 'sui_memez_publish_coin'
  | 'sui_memez_create_pool'
  | 'sui_launchpad_publish_coin'
  | 'sui_launchpad_open_pool'
  | 'sui_launchpad_buy'
  | 'sui_launchpad_sell'

export type UnsignedEncoding = 'message-v0' | 'solana-tx' | 'eip1559' | 'sui-tx'

export type Eip1559Tx = {
  type: 2
  chainId: number
  to: string
  data: string
  value: string
  nonce: number
  gas: string
  maxFeePerGas: string
  maxPriorityFeePerGas: string
}

export type UnsignedStep = {
  kind: UnsignedStepKind
  messageBase64: string
  transactionBase64?: string
  recentBlockhash: string
  lastValidBlockHeight: number
  requiredSigners: string[]
  v: 0
  encoding?: UnsignedEncoding
  tx?: Eip1559Tx
  note?: string
  signTogether?: boolean
}

export type UnsignedLaunchPlan = {
  ok: true
  platform?: LaunchPlatform
  mint: string
  pumpUrl: string
  coinUrl?: string
  steps: UnsignedStep[]
  launcher: string
  createdAt: number
  note?: string
  encoding?: UnsignedEncoding
  warnings?: string[]
  splitAddress?: string
  launchpad?: {
    backend: 'crewpay'
    network: string
    packageId: string
    configId: string
    customConfigEnforced: boolean
  }
  memez?: {
    network: string
    configurationKey: string
    customConfigEnforced: boolean
    migratorWitness: string
    quoteCoinType: string
  }
  followUp?: Record<string, unknown>
  feesLockedAtLaunch?: boolean
  lockPath?: UnsignedPumpLockPath
  signTogether?: boolean
}

export async function buildUnsignedLaunchTransactions(opts: {
  name: string
  ticker: string
  metadataUri: string
  launcherPubkey: string
  crewShareholders?: { wallet: string; bps: number }[] | null
  initialBuySol?: number
  mintPubkey?: string
}): Promise<UnsignedLaunchPlan> {
  const connection = getConnection()
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
  const online = new OnlinePumpSdk(connection)
  const sdk = new PumpSdk()
  const global = await online.fetchGlobal()
  const launcher = new PublicKey(opts.launcherPubkey)
  const mint = new PublicKey(resolveUnsignedPumpMint(opts.mintPubkey))
  const steps: UnsignedStep[] = []
  const createIxs: TransactionInstruction[] = []
  const initialBuySol = Math.max(0, Math.floor((opts.initialBuySol || 0) * 1e9))

  if (initialBuySol > 0) {
    let feeConfig = null
    try {
      feeConfig = await online.fetchFeeConfig()
    } catch {
      feeConfig = null
    }
    const solAmount = new BN(initialBuySol)
    const buyAmount = getBuyTokenAmountFromSolAmount({
      global,
      feeConfig,
      mintSupply: null,
      bondingCurve: null,
      amount: solAmount,
      quoteMint: NATIVE_MINT,
    })
    const createBuy = await sdk.createV2AndBuyInstructions({
      global,
      mint,
      name: opts.name,
      symbol: opts.ticker,
      uri: opts.metadataUri,
      creator: launcher,
      user: launcher,
      amount: buyAmount,
      solAmount,
      mayhemMode: false,
    })
    createIxs.push(...createBuy)
  } else {
    const createIx = await sdk.createV2Instruction({
      mint,
      name: opts.name,
      symbol: opts.ticker,
      uri: opts.metadataUri,
      creator: launcher,
      user: launcher,
      mayhemMode: false,
    })
    createIxs.push(createIx)
  }

  const createShareIx = await sdk.createFeeSharingConfig({
    creator: launcher,
    mint,
    pool: null,
  })
  const feeIxs: TransactionInstruction[] = [createShareIx]
  if (opts.crewShareholders && opts.crewShareholders.length > 0) {
    feeIxs.push(
      await sdk.updateFeeSharesV2({
        authority: launcher,
        mint,
        currentShareholders: [launcher],
        newShareholders: opts.crewShareholders.map((s) => ({
          address: new PublicKey(s.wallet),
          shareBps: s.bps,
        })),
        quoteMint: NATIVE_MINT,
        quoteTokenProgram: TOKEN_PROGRAM_ID,
      }),
    )
  }

  const alts = await loadLookupTables(connection)
  const combined = compileUnsignedV0({
    payer: launcher,
    ixs: [...createIxs, ...feeIxs],
    blockhash,
    alts,
  })
  const lockPath = chooseUnsignedPumpLockPath(combined.signedBytes)
  const mintStr = mint.toBase58()
  const launcherStr = launcher.toBase58()

  if (lockPath === 'atomic-v0') {
    steps.push({
      kind: initialBuySol > 0 ? 'create_and_buy' : 'create_and_lock',
      messageBase64: combined.messageBase64,
      recentBlockhash: blockhash,
      lastValidBlockHeight,
      requiredSigners: [launcherStr, mintStr],
      v: 0,
      note: FEES_LOCKED_AT_LAUNCH_SINGLE,
    })
  } else {
    const create = compileUnsignedV0({
      payer: launcher,
      ixs: createIxs,
      blockhash,
      alts,
    })
    const lock = compileUnsignedV0({
      payer: launcher,
      ixs: feeIxs,
      blockhash,
      alts,
    })
    steps.push({
      kind: initialBuySol > 0 ? 'create_and_buy' : 'create',
      messageBase64: create.messageBase64,
      recentBlockhash: blockhash,
      lastValidBlockHeight,
      requiredSigners: [launcherStr, mintStr],
      v: 0,
      signTogether: true,
      note: FEES_LOCKED_AT_LAUNCH_PAIR,
    })
    steps.push({
      kind: 'lock',
      messageBase64: lock.messageBase64,
      recentBlockhash: blockhash,
      lastValidBlockHeight,
      requiredSigners: [launcherStr],
      v: 0,
      signTogether: true,
      note: FEES_LOCKED_AT_LAUNCH_PAIR,
    })
  }

  return {
    ok: true,
    platform: 'pumpfun',
    mint: mintStr,
    pumpUrl: PUMP_COIN_URL(mintStr),
    coinUrl: PUMP_COIN_URL(mintStr),
    steps,
    launcher: launcherStr,
    createdAt: Date.now(),
    encoding: 'message-v0',
    feesLockedAtLaunch: true,
    lockPath,
    signTogether: lockPath === 'signAllTransactions',
    note: lockPath === 'atomic-v0' ? FEES_LOCKED_AT_LAUNCH_SINGLE : FEES_LOCKED_AT_LAUNCH_PAIR,
  }
}

