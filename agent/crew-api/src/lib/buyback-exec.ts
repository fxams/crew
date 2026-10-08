/**
 * Shared CREW buyback execution used by the hourly cron and optional manual trigger.
 */

import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
import bs58 from 'bs58'
import { query } from './db.js'
import { executeJupiterSwap, getJupiterQuote } from './jupiter.js'

export type BuybackRunResult = {
  status: 'ok' | 'skipped' | 'dry_run' | 'error'
  detail: string
  solSpent?: number
  signature?: string
  crewMint?: string
  outAmount?: string
}

export async function logBuybackRun(
  status: string,
  detail: string,
  extra?: { solSpent?: number; signature?: string; crewMint?: string },
): Promise<void> {
  await query(
    `INSERT INTO buyback_runs (status, sol_spent, crew_mint, signature, detail)
     VALUES ($1,$2,$3,$4,$5)`,
    [
      status,
      extra?.solSpent ?? null,
      extra?.crewMint ?? null,
      extra?.signature ?? null,
      detail,
    ],
  )
  console.log(`[buyback] ${status}: ${detail}`)
}

function parseSecret(secret: string): Keypair {
  try {
    return Keypair.fromSecretKey(bs58.decode(secret))
  } catch {
    const arr = JSON.parse(secret) as number[]
    return Keypair.fromSecretKey(Uint8Array.from(arr))
  }
}

export async function runCrewBuyback(opts?: {
  forceDryRun?: boolean
}): Promise<BuybackRunResult> {
  const mint = process.env.CREW_BUYBACK_MINT?.trim() || process.env.VITE_CREW_MINT?.trim()
  const secret = process.env.CREW_BUYBACK_PRIVATE_KEY?.trim()
  const maxSol = Number(process.env.CREW_BUYBACK_MAX_SOL || '0.05')
  const slippageBps = Number(process.env.CREW_BUYBACK_SLIPPAGE_BPS || '100')
  const dryEnv = process.env.CREW_BUYBACK_DRY_RUN?.trim()
  const dryRun =
    opts?.forceDryRun ||
    dryEnv === '1' ||
    dryEnv === 'true' ||
    (!dryEnv && process.env.NODE_ENV !== 'production')
  const rpc =
    process.env.RPC_URL?.trim() ||
    process.env.VITE_RPC_URL?.trim() ||
    'https://solana-rpc.publicnode.com'

  if (!mint || !secret) {
    const result: BuybackRunResult = {
      status: 'skipped',
      detail: 'Set CREW_BUYBACK_PRIVATE_KEY and CREW_BUYBACK_MINT to enable auto-buy.',
    }
    await logBuybackRun(result.status, result.detail)
    return result
  }

  let kp: Keypair
  try {
    kp = parseSecret(secret)
  } catch {
    const result: BuybackRunResult = {
      status: 'error',
      detail: 'Invalid CREW_BUYBACK_PRIVATE_KEY format',
      crewMint: mint,
    }
    await logBuybackRun(result.status, result.detail, { crewMint: mint })
    return result
  }

  const connection = new Connection(rpc, 'confirmed')
  const bal = await connection.getBalance(kp.publicKey)
  const sol = bal / LAMPORTS_PER_SOL
  const spend = Math.min(maxSol, Math.max(0, sol - 0.01))

  if (spend < 0.005) {
    const result: BuybackRunResult = {
      status: 'skipped',
      detail: `Treasury ${kp.publicKey.toBase58()} has ${sol.toFixed(4)} SOL — below buy threshold`,
      crewMint: mint,
    }
    await logBuybackRun(result.status, result.detail, { crewMint: mint })
    return result
  }

  try {
    const info = await connection.getAccountInfo(new PublicKey(mint))
    if (!info) {
      const result: BuybackRunResult = {
        status: 'skipped',
        detail: `CREW mint ${mint} not found on-chain yet`,
        crewMint: mint,
      }
      await logBuybackRun(result.status, result.detail, { crewMint: mint })
      return result
    }
  } catch (err) {
    const result: BuybackRunResult = {
      status: 'error',
      detail: err instanceof Error ? err.message : 'mint check failed',
      crewMint: mint,
    }
    await logBuybackRun(result.status, result.detail, { crewMint: mint })
    return result
  }

  const lamports = Math.floor(spend * LAMPORTS_PER_SOL)
  let quote
  try {
    quote = await getJupiterQuote({
      outputMint: mint,
      amountLamports: lamports,
      slippageBps,
    })
  } catch (err) {
    const result: BuybackRunResult = {
      status: 'error',
      detail: `Jupiter quote failed: ${err instanceof Error ? err.message : 'unknown'}`,
      crewMint: mint,
    }
    await logBuybackRun(result.status, result.detail, { crewMint: mint })
    return result
  }

  if (dryRun) {
    const result: BuybackRunResult = {
      status: 'dry_run',
      detail: `Dry-run: would spend ${spend.toFixed(4)} SOL for ~${quote.outAmount} CREW via Jupiter (set CREW_BUYBACK_DRY_RUN=0 to execute)`,
      solSpent: 0,
      crewMint: mint,
      outAmount: quote.outAmount,
    }
    await logBuybackRun(result.status, result.detail, {
      solSpent: 0,
      crewMint: mint,
    })
    return result
  }

  try {
    const { signature, outAmount } = await executeJupiterSwap({
      connection,
      payer: kp,
      quote,
    })
    const result: BuybackRunResult = {
      status: 'ok',
      detail: `Bought CREW with ${spend.toFixed(4)} SOL → ${outAmount} raw tokens`,
      solSpent: spend,
      signature,
      crewMint: mint,
      outAmount,
    }
    await logBuybackRun(result.status, result.detail, {
      solSpent: spend,
      signature,
      crewMint: mint,
    })
    return result
  } catch (err) {
    const result: BuybackRunResult = {
      status: 'error',
      detail: `Jupiter swap failed: ${err instanceof Error ? err.message : 'unknown'}`,
      crewMint: mint,
    }
    await logBuybackRun(result.status, result.detail, { crewMint: mint })
    return result
  }
}

export async function listBuybackRuns(limit = 40) {
  const { rows } = await query(
    `SELECT id, status, sol_spent::float8 AS sol_spent, crew_mint, signature, detail, created_at
     FROM buyback_runs
     ORDER BY created_at DESC
     LIMIT $1`,
    [Math.min(200, Math.max(1, limit))],
  )
  return rows.map((r) => ({
    id: Number(r.id),
    status: String(r.status),
    solSpent: r.sol_spent == null ? null : Number(r.sol_spent),
    crewMint: r.crew_mint ? String(r.crew_mint) : null,
    signature: r.signature ? String(r.signature) : null,
    detail: r.detail ? String(r.detail) : null,
    at: new Date(String(r.created_at)).getTime(),
  }))
}

export async function buybackStats() {
  const { rows } = await query<{
    runs: string
    ok_runs: string
    sol_spent: string | null
  }>(
    `SELECT
       count(*)::text AS runs,
       count(*) FILTER (WHERE status = 'ok')::text AS ok_runs,
       coalesce(sum(sol_spent) FILTER (WHERE status = 'ok'), 0)::text AS sol_spent
     FROM buyback_runs`,
  )
  const row = rows[0]
  return {
    runs: Number(row?.runs || 0),
    okRuns: Number(row?.ok_runs || 0),
    solSpentOk: Number(row?.sol_spent || 0),
  }
}
