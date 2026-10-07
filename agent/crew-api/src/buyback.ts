/**
 * CREW buyback cron entrypoint.
 *
 * Env (server-only — never VITE_*):
 *   DATABASE_URL
 *   CREW_BUYBACK_PRIVATE_KEY   base58 secret key (optional until ready)
 *   CREW_BUYBACK_MINT          $CREW mint address (required to execute buys)
 *   CREW_BUYBACK_MAX_SOL       max SOL per run (default 0.05)
 *   RPC_URL                    server RPC
 *
 * Until CREW_BUYBACK_PRIVATE_KEY + CREW_BUYBACK_MINT are set, this job
 * records a skipped run and exits 0 (safe for cron).
 */

import { Keypair, Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
import bs58 from 'bs58'
import { query, migrate } from './lib/db.js'

async function logRun(status: string, detail: string, extra?: {
  solSpent?: number
  signature?: string
  crewMint?: string
}) {
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

async function main() {
  await migrate()

  const mint = process.env.CREW_BUYBACK_MINT?.trim()
  const secret = process.env.CREW_BUYBACK_PRIVATE_KEY?.trim()
  const maxSol = Number(process.env.CREW_BUYBACK_MAX_SOL || '0.05')
  const rpc =
    process.env.RPC_URL?.trim() ||
    process.env.VITE_RPC_URL?.trim() ||
    'https://solana-rpc.publicnode.com'

  if (!mint || !secret) {
    await logRun(
      'skipped',
      'Set CREW_BUYBACK_PRIVATE_KEY and CREW_BUYBACK_MINT to enable auto-buy.',
    )
    return
  }

  let kp: Keypair
  try {
    kp = Keypair.fromSecretKey(bs58.decode(secret))
  } catch {
    // Also accept JSON byte array
    try {
      const arr = JSON.parse(secret) as number[]
      kp = Keypair.fromSecretKey(Uint8Array.from(arr))
    } catch {
      await logRun('error', 'Invalid CREW_BUYBACK_PRIVATE_KEY format')
      process.exitCode = 1
      return
    }
  }

  const connection = new Connection(rpc, 'confirmed')
  const bal = await connection.getBalance(kp.publicKey)
  const sol = bal / LAMPORTS_PER_SOL
  const spend = Math.min(maxSol, Math.max(0, sol - 0.01))

  if (spend < 0.005) {
    await logRun(
      'skipped',
      `Treasury ${kp.publicKey.toBase58()} has ${sol.toFixed(4)} SOL — below buy threshold`,
      { crewMint: mint },
    )
    return
  }

  // Placeholder: Jupiter/swap integration lands after $CREW mint is live.
  // We verify the mint exists, then record a dry-run until swap is wired.
  try {
    const info = await connection.getAccountInfo(new PublicKey(mint))
    if (!info) {
      await logRun('skipped', `CREW mint ${mint} not found on-chain yet`, {
        crewMint: mint,
      })
      return
    }
  } catch (err) {
    await logRun('error', err instanceof Error ? err.message : 'mint check failed', {
      crewMint: mint,
    })
    process.exitCode = 1
    return
  }

  await logRun(
    'dry_run',
    `Would spend up to ${spend.toFixed(4)} SOL buying ${mint} from ${kp.publicKey.toBase58()} (swap not wired yet)`,
    { solSpent: 0, crewMint: mint },
  )
}

main().catch(async (err) => {
  console.error(err)
  try {
    await logRun('error', err instanceof Error ? err.message : 'buyback crashed')
  } catch {
    /* ignore */
  }
  process.exit(1)
})
