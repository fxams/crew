import { Keypair, PublicKey, TransactionMessage, type TransactionInstruction } from '@solana/web3.js'
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import BN from 'bn.js'
import { OnlinePumpSdk, PumpSdk, getBuyTokenAmountFromSolAmount } from './pump.js'
import { getConnection } from './send.js'
import { PUMP_COIN_URL } from './constants.js'
import type { LaunchPlatform } from './platforms.js'

export type UnsignedStepKind =
  | 'create'
  | 'lock'
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
  const mintKp = opts.mintPubkey ? null : Keypair.generate()
  const mint = new PublicKey(opts.mintPubkey || mintKp!.publicKey.toBase58())
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

  const createMsg = new TransactionMessage({
    payerKey: launcher,
    recentBlockhash: blockhash,
    instructions: createIxs,
  }).compileToV0Message()
  steps.push({
    kind: initialBuySol > 0 ? 'create_and_buy' : 'create',
    messageBase64: Buffer.from(createMsg.serialize()).toString('base64'),
    recentBlockhash: blockhash,
    lastValidBlockHeight,
    requiredSigners: [launcher.toBase58(), mint.toBase58()],
    v: 0,
  })

  // Fee-share open + lock
  const createShareIx = await sdk.createFeeSharingConfig({
    creator: launcher,
    mint,
    pool: null,
  })
  if (opts.crewShareholders && opts.crewShareholders.length > 0) {
    const updateShareIx = await sdk.updateFeeSharesV2({
      authority: launcher,
      mint,
      currentShareholders: [launcher],
      newShareholders: opts.crewShareholders.map((s) => ({
        address: new PublicKey(s.wallet),
        shareBps: s.bps,
      })),
      quoteMint: NATIVE_MINT,
      quoteTokenProgram: TOKEN_PROGRAM_ID,
    })
    const feeMsg = new TransactionMessage({
      payerKey: launcher,
      recentBlockhash: blockhash,
      instructions: [createShareIx, updateShareIx],
    }).compileToV0Message()
    steps.push({
      kind: 'lock',
      messageBase64: Buffer.from(feeMsg.serialize()).toString('base64'),
      recentBlockhash: blockhash,
      lastValidBlockHeight,
      requiredSigners: [launcher.toBase58()],
      v: 0,
    })
  } else {
    // Only open config — holderKol path or lock later
    const openMsg = new TransactionMessage({
      payerKey: launcher,
      recentBlockhash: blockhash,
      instructions: [createShareIx],
    }).compileToV0Message()
    steps.push({
      kind: 'lock',
      messageBase64: Buffer.from(openMsg.serialize()).toString('base64'),
      recentBlockhash: blockhash,
      lastValidBlockHeight,
      requiredSigners: [launcher.toBase58()],
      v: 0,
    })
  }

  const mintStr = mint.toBase58()
  return {
    ok: true,
    platform: 'pumpfun',
    mint: mintStr,
    pumpUrl: PUMP_COIN_URL(mintStr),
    coinUrl: PUMP_COIN_URL(mintStr),
    steps,
    launcher: launcher.toBase58(),
    createdAt: Date.now(),
    encoding: 'message-v0',
  }
}

