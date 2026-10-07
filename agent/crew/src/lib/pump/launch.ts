import { Keypair, PublicKey, type TransactionInstruction } from '@solana/web3.js'
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { getBuyTokenAmountFromSolAmount } from '@pump-fun/pump-sdk'
import BN from 'bn.js'
import type { WalletContextState } from '@solana/wallet-adapter-react'
import { PUMP_COIN_URL } from '../config'
import { DEFAULT_BUYBACK, DEFAULT_RAID_QUESTS } from '../edges'
import type { LaunchDraft, LaunchResult } from '../types'
import { validateDraft } from '../validation'
import {
  formatRpcError,
  getLatestBlockhashSafe,
  getOnlineSdk,
  getPumpSdk,
} from './connection'
import { sendInstructions } from './send'
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
 *
 * If step 3 fails after create lands, still return the coin so the desk can
 * retry fee-share — otherwise the mint is orphaned and crew never gets paid.
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

    // Pick a browser-safe RPC before any chain reads (official mainnet often 403s).
    await getLatestBlockhashSafe('confirmed')
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
      wallet,
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
    const mintStr = mint.toBase58()
    const launchedAt = Number(new Date())
    const baseCoin = {
      id: id('coin'),
      mint: mintStr,
      name: normalized.name,
      ticker: normalized.ticker,
      vibe: normalized.vibe,
      mode: normalized.mode,
      crew: normalized.crew,
      signature: createSig,
      launchedAt,
      launcher: launcher.toBase58(),
      pumpUrl: PUMP_COIN_URL(mintStr),
      ...deskPrograms(draft, normalized.mode),
    }

    try {
      const createShareIx = await sdk.createFeeSharingConfig({
        creator: launcher,
        mint,
        pool: null,
      })

      // Holder KOL: create config only — finalize later from top holders ∩ KOL DB.
      if (draft.holderKol) {
          const openSig = await sendWithMintSigner(wallet, [createShareIx])
        return {
          ok: true,
          coin: {
            ...baseCoin,
            crew: normalized.crew,
            holderKol: true,
            // Config created; shares not finalized until Holder KOL lock.
            // openSig proves createFeeSharingConfig landed.
            feeShareSignature: undefined,
          },
          remits: [],
          warning:
            `Mint live · fee config ${openSig.slice(0, 8)}… · Holder KOL open. Poll top holders on the desk, then Lock once (Pump allows one lock).`,
        }
      }

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

      const feeShareSignature = await sendWithMintSigner(wallet, [
        createShareIx,
        updateShareIx,
      ])

      return {
        ok: true,
        coin: { ...baseCoin, feeShareSignature },
        remits: [],
      }
    } catch (feeErr) {
      console.error('Fee-share failed after create — coin preserved for wire retry', feeErr)
      const detail = formatRpcError(
        feeErr instanceof Error ? feeErr : new Error('Fee-share failed.'),
      )
      return {
        ok: true,
        coin: { ...baseCoin, holderKol: Boolean(draft.holderKol) },
        remits: [],
        warning: draft.holderKol
          ? `Mint live but fee-share config missing — open Holder KOL on the desk to create + lock. ${detail}`
          : `Mint live but crew fee-share not locked — Wire fees on the desk or crew stays unpaid. ${detail}`,
      }
    }
  } catch (err) {
    console.error(err)
    return {
      ok: false,
      error: formatRpcError(err instanceof Error ? err : new Error('Launch failed.')),
    }
  }
}

async function sendWithMintSigner(
  wallet: WalletContextState,
  ixs: TransactionInstruction[],
  mintKp?: Keypair,
): Promise<string> {
  return sendInstructions({
    wallet,
    ixs,
    signers: mintKp ? [mintKp] : [],
    // Mint create cannot safely retry (key would change); fee-share can.
    attempts: mintKp ? 1 : 2,
  })
}
