/**
 * CREW buyback cron entrypoint.
 *
 * Env (server-only — never VITE_*):
 *   DATABASE_URL
 *   CREW_BUYBACK_PRIVATE_KEY   base58 secret key (optional until ready)
 *   CREW_BUYBACK_MINT          $CREW mint address (required to execute buys)
 *   CREW_BUYBACK_MAX_SOL       max SOL per run (default 0.05)
 *   CREW_BUYBACK_DRY_RUN       set 0/false to execute Jupiter swaps (default dry in non-prod)
 *   CREW_BUYBACK_SLIPPAGE_BPS  default 100 (1%)
 *   RPC_URL                    server RPC
 *
 * Until CREW_BUYBACK_PRIVATE_KEY + CREW_BUYBACK_MINT are set, this job
 * records a skipped run and exits 0 (safe for cron).
 */

import { migrate } from './lib/db.js'
import { runCrewBuyback } from './lib/buyback-exec.js'
import { emitWebhookEvent } from './lib/webhooks.js'

async function main() {
  await migrate()
  const result = await runCrewBuyback()
  if (result.status === 'ok') {
    try {
      await emitWebhookEvent('buyback.executed', {
        signature: result.signature,
        solSpent: result.solSpent,
        crewMint: result.crewMint,
        outAmount: result.outAmount,
      })
    } catch {
      /* webhook failures must not fail the cron */
    }
  }
  if (result.status === 'error') process.exitCode = 1
}

main().catch(async (err) => {
  console.error(err)
  process.exit(1)
})
