/**
 * Real Dip Buyback fire + Raid claim executions (wallet-signed).
 * Preview helpers remain in desk-actions.ts for dry projections.
 * Dip/Raid rules are enforced via desk-rules before signing.
 */

import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js'
import type { WalletContextState } from '@solana/wallet-adapter-react'
import { RPC_URL } from './config'
import { DEFAULT_BUYBACK } from './edges'
import {
  evaluateDipGate,
  evaluateRaidGate,
  markDipFired,
  markRaidClaimed,
} from './desk-rules'
import type { CoinRecord, RemitRecord } from './types'

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

async function sendWalletTx(wallet: WalletContextState, tx: Transaction): Promise<string> {
  if (!wallet.publicKey || !wallet.sendTransaction) {
    throw new Error('Connect Phantom to execute.')
  }
  const connection = new Connection(RPC_URL, 'confirmed')
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
  tx.feePayer = wallet.publicKey
  tx.recentBlockhash = blockhash
  const sig = await wallet.sendTransaction(tx, connection)
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed')
  return sig
}

/** Raid claim: transfer SOL from launcher desk wallet to a crew member. */
export async function executeRaidClaim(opts: {
  coin: CoinRecord
  wallet: WalletContextState
  questId?: string
  /** Proof link / reference required by the quest (unless force). */
  proofUrl?: string
  amountSol?: number
  /** Skip proof + cooldown checks (operator override). */
  force?: boolean
}): Promise<{
  id: string
  signature: string
  amountSol: number
  handle: string
  wallet: string
  kind: 'raid_claim'
  questId: string
  proofUrl?: string
}> {
  const { coin, wallet } = opts
  if (!wallet.publicKey) throw new Error('Connect Phantom.')

  const gate = evaluateRaidGate(coin, {
    questId: opts.questId,
    proofUrl: opts.proofUrl,
    force: opts.force,
  })
  if (!gate.ok) throw new Error(gate.error)
  const quest = gate.quest

  const winner =
    coin.crew.find((c) => c.hireRole === 'raid') ||
    coin.crew[0]
  if (!winner?.wallet) throw new Error('No crew wallet to pay.')

  const amountSol =
    opts.amountSol ??
    Math.max(0.001, Number(((0.05 * quest.bountyBps) / 10_000).toFixed(4)))
  const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL)
  if (lamports < 1_000_000) throw new Error('Raid claim amount too small.')

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: new PublicKey(winner.wallet),
      lamports,
    }),
  )
  const signature = await sendWalletTx(wallet, tx)
  markRaidClaimed(coin.mint, quest.id)
  return {
    id: id('raid'),
    signature,
    amountSol,
    handle: winner.handle,
    wallet: winner.wallet,
    kind: 'raid_claim',
    questId: quest.id,
    proofUrl: opts.proofUrl?.trim() || undefined,
  }
}

/**
 * Dip fire: Jupiter swap SOL → the launched coin mint (desk buys the dip).
 * Falls back to error if Jupiter egress fails — preview still available.
 */
export async function executeBuybackFire(opts: {
  coin: CoinRecord
  wallet: WalletContextState
  amountSol?: number
  remits?: RemitRecord[]
  /** Skip dip% + cooldown checks (operator override). */
  force?: boolean
}): Promise<{
  id: string
  signature: string
  amountSol: number
  handle: string
  wallet: string
  kind: 'dip_fire'
  outAmount?: string
  dropPct?: number
  priceUsd?: number
}> {
  const { coin, wallet } = opts
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error('Connect Phantom with transaction signing.')
  }

  const gate = await evaluateDipGate(coin, { force: opts.force, remits: opts.remits })
  if (!gate.ok) throw new Error(gate.error)

  const rule = gate.rule ?? coin.buybackRule ?? DEFAULT_BUYBACK
  const amountSol = Math.min(
    rule.maxSolPerFire,
    opts.amountSol ?? Math.max(0.005, rule.maxSolPerFire * 0.25),
  )
  const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL)
  const SOL = 'So11111111111111111111111111111111111111112'
  const quoteUrls = [
    `https://lite-api.jup.ag/swap/v1/quote?inputMint=${SOL}&outputMint=${coin.mint}&amount=${lamports}&slippageBps=100`,
    `https://api.jup.ag/swap/v1/quote?inputMint=${SOL}&outputMint=${coin.mint}&amount=${lamports}&slippageBps=100`,
  ]

  let quote: Record<string, unknown> | null = null
  for (const url of quoteUrls) {
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      quote = (await res.json()) as Record<string, unknown>
      if (quote?.outAmount) break
    } catch {
      /* try next */
    }
  }
  if (!quote?.outAmount) {
    throw new Error('Jupiter quote failed — use Preview for a dry projection, or retry later.')
  }

  const swapUrls = ['https://lite-api.jup.ag/swap/v1/swap', 'https://api.jup.ag/swap/v1/swap']
  let swapTxB64: string | null = null
  for (const url of swapUrls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: wallet.publicKey.toBase58(),
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
        }),
      })
      if (!res.ok) continue
      const json = (await res.json()) as { swapTransaction?: string }
      if (json.swapTransaction) {
        swapTxB64 = json.swapTransaction
        break
      }
    } catch {
      /* try next */
    }
  }
  if (!swapTxB64) throw new Error('Jupiter swap build failed.')

  const { VersionedTransaction } = await import('@solana/web3.js')
  const connection = new Connection(RPC_URL, 'confirmed')
  const vtx = VersionedTransaction.deserialize(Buffer.from(swapTxB64, 'base64'))
  const signed = await wallet.signTransaction(vtx)
  const signature = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  })
  const latest = await connection.getLatestBlockhash('confirmed')
  await connection.confirmTransaction({ signature, ...latest }, 'confirmed')

  markDipFired(coin.mint)
  return {
    id: id('buyback'),
    signature,
    amountSol,
    handle: '@buyback',
    wallet: wallet.publicKey.toBase58(),
    kind: 'dip_fire',
    outAmount: String(quote.outAmount),
    dropPct: gate.dropPct,
    priceUsd: gate.priceUsd,
  }
}
