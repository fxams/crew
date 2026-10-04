import {
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { getBuyTokenAmountFromSolAmount } from '@pump-fun/pump-sdk'
import BN from 'bn.js'
import type { WalletContextState } from '@solana/wallet-adapter-react'
import { PUMP_COIN_URL } from '../config'
import { DEFAULT_BUYBACK, DEFAULT_RAID_QUESTS } from '../edges'
import type { LaunchDraft, LaunchResult, RemitRecord } from '../types'
import { validateDraft } from '../validation'
import { getConnection, getOnlineSdk, getPumpSdk } from './connection'
import { uploadPumpMetadata } from './ipfs'

function deskPrograms(draft: LaunchDraft, mode: LaunchDraft['mode']) {
  if (mode === 'buyback') {
    return {
      buybackRule: draft.buybackRule ?? { ...DEFAULT_BUYBACK },
      raidQuests: undefined,
      agent: undefined,
    }
  }
  if (mode === 'raid') {
    return {
      buybackRule: undefined,
      raidQuests: (draft.raidQuests ?? DEFAULT_RAID_QUESTS).map((q) => ({ ...q })),
      agent: undefined,
    }
  }
  if (mode === 'agent') {
    return {
      buybackRule: undefined,
      raidQuests: undefined,
      agent: draft.agent
        ? { ...draft.agent }
        : { name: 'Crew Agent', objective: 'Hire KOLs. Pay the tape.', model: 'custom' },
    }
  }
  return { buybackRule: undefined, raidQuests: undefined, agent: undefined }
}

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export type MainnetLaunchCtx = {
  wallet: WalletContextState
}

/**
 * Mainnet path:
 * 1) Upload metadata to Pump IPFS
 * 2) createV2 (+ optional first buy)
 * 3) createFeeSharingConfig + updateFeeSharesV2 (permanent crew / desk bps)
 */
export async function launchMainnet(
  draft: LaunchDraft,
  ctx: MainnetLaunchCtx,
): Promise<LaunchResult> {
  try {
    const { wallet } = ctx
    if (!wallet.publicKey || !wallet.sendTransaction) {
      return { ok: false, error: 'Connect a Solana wallet to launch on mainnet.' }
    }

    const launcher = wallet.publicKey
    const normalized = validateDraft(draft, {
      deskWallet: launcher.toBase58(),
    })

    const online = getOnlineSdk()
    const sdk = getPumpSdk()

    const image = draft.imageFile
    if (!image) {
      return { ok: false, error: 'Coin image is required.' }
    }
    const { metadataUri } = await uploadPumpMetadata({
      name: normalized.name,
      symbol: normalized.ticker,
      description: normalized.vibe,
      twitter: normalized.twitter,
      website: normalized.website,
      file: image,
    })

    const mintKp = Keypair.generate()
    const global = await online.fetchGlobal()
    const createIxs: TransactionInstruction[] = []

    if (normalized.initialBuySol > 0) {
      const solAmount = new BN(Math.round(normalized.initialBuySol * 1e9))
      let feeConfig = null
      try {
        feeConfig = await online.fetchFeeConfig()
      } catch {
        feeConfig = null
      }
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
        mint: mintKp.publicKey,
        name: normalized.name,
        symbol: normalized.ticker,
        uri: metadataUri,
        creator: launcher,
        user: launcher,
        amount: buyAmount,
        solAmount,
        mayhemMode: false,
      })
      createIxs.push(...createBuy)
    } else {
      const createIx = await sdk.createV2Instruction({
        mint: mintKp.publicKey,
        name: normalized.name,
        symbol: normalized.ticker,
        uri: metadataUri,
        creator: launcher,
        user: launcher,
        mayhemMode: false,
      })
      createIxs.push(createIx)
    }

    const createSig = await sendWithMintSigner(wallet, createIxs, mintKp)

    const mint = mintKp.publicKey
    const createShareIx = await sdk.createFeeSharingConfig({
      creator: launcher,
      mint,
      pool: null,
    })

    const newShareholders = normalized.shareholders.map((s) => ({
      address: new PublicKey(s.wallet),
      shareBps: s.bps,
    }))

    const updateShareIx = await sdk.updateFeeSharesV2({
      authority: launcher,
      mint,
      currentShareholders: [launcher],
      newShareholders,
      quoteMint: NATIVE_MINT,
      quoteTokenProgram: TOKEN_PROGRAM_ID,
    })

    const feeShareSignature = await sendWithMintSigner(wallet, [createShareIx, updateShareIx])

    const launchedAt = Number(new Date())
    const remits: RemitRecord[] = normalized.shareholders
      .filter((s) => s.role === 'crew')
      .map((s, i) => ({
        id: id('remit'),
        mint: mint.toBase58(),
        ticker: normalized.ticker,
        handle: s.handle,
        wallet: s.wallet,
        amountSol: 0,
        mode: normalized.mode,
        at: launchedAt + i,
        signature: feeShareSignature,
      }))

    return {
      ok: true,
      coin: {
        id: id('coin'),
        mint: mint.toBase58(),
        name: normalized.name,
        ticker: normalized.ticker,
        vibe: normalized.vibe,
        mode: normalized.mode,
        crew: normalized.crew,
        signature: createSig,
        feeShareSignature,
        launchedAt,
        launcher: launcher.toBase58(),
        pumpUrl: PUMP_COIN_URL(mint.toBase58()),
        ...deskPrograms(draft, normalized.mode),
      },
      remits,
    }
  } catch (err) {
    console.error(err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Launch failed.',
    }
  }
}

async function sendWithMintSigner(
  wallet: WalletContextState,
  ixs: TransactionInstruction[],
  mintKp?: Keypair,
): Promise<string> {
  if (!wallet.publicKey || !wallet.sendTransaction) {
    throw new Error('Wallet not ready.')
  }
  const connection = getConnection()
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
  const tx = new Transaction({
    feePayer: wallet.publicKey,
    blockhash,
    lastValidBlockHeight,
  }).add(...ixs)

  const signature = await wallet.sendTransaction(tx, connection, {
    signers: mintKp ? [mintKp] : [],
    skipPreflight: false,
  })
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
  return signature
}
