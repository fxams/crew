/**
 * Pump.fun graduation detection + one-shot persist + webhook.
 * Bags/Zora have no Pump graduation — those coins stay unmarked.
 * CrewPay does not tweet on graduation.
 */

import { coinPageUrl } from './coin-page.js'
import type { ApiCoin } from './coins.js'
import { query } from './db.js'
import { emitWebhookEvent } from './webhooks.js'

export type GraduationEvidence = {
  graduated: boolean
  via: string | null
}

export function detectGraduation(input: {
  platform?: string | null
  pump?: Record<string, unknown> | null
  dexId?: string | null
}): GraduationEvidence {
  const platform = (input.platform || 'pumpfun').toLowerCase()
  if (platform !== 'pumpfun' && platform !== 'pump') {
    return { graduated: false, via: null }
  }
  const pump = input.pump
  if (pump) {
    if (pump.complete === true || pump.complete === 'true') {
      return { graduated: true, via: 'pump-complete' }
    }
    const ray = pump.raydium_pool || pump.raydiumPool
    if (typeof ray === 'string' && ray.trim()) return { graduated: true, via: 'raydium' }
    const swap = pump.pump_swap || pump.pumpSwap || pump.pump_swap_pool
    if (typeof swap === 'string' && swap.trim()) return { graduated: true, via: 'pumpswap' }
    if (swap === true) return { graduated: true, via: 'pumpswap' }
  }
  const dex = String(input.dexId || '').toLowerCase()
  if (dex === 'pumpswap' || dex === 'pump-swap') return { graduated: true, via: 'pumpswap' }
  if (dex === 'raydium') return { graduated: true, via: 'raydium' }
  return { graduated: false, via: null }
}

/** First time we observe graduation: persist + emit coin.graduated. Never tweets. */
export async function recordGraduationIfNew(
  coin: ApiCoin,
  evidence: GraduationEvidence,
): Promise<{ first: boolean; graduatedAt: number | null; via: string | null }> {
  if (coin.graduatedAt) {
    return { first: false, graduatedAt: coin.graduatedAt, via: coin.graduatedVia || null }
  }
  if (!evidence.graduated) {
    return { first: false, graduatedAt: null, via: null }
  }
  const at = Date.now()
  const via = (evidence.via || 'observed').slice(0, 32)
  const res = await query(
    `UPDATE coins
     SET graduated_at = COALESCE(graduated_at, to_timestamp($2/1000.0)),
         graduated_via = COALESCE(graduated_via, $3),
         updated_at = now()
     WHERE mint = $1 AND graduated_at IS NULL`,
    [coin.mint, at, via],
  )
  const first = (res.rowCount || 0) > 0
  if (first) {
    void emitWebhookEvent('coin.graduated', {
      mint: coin.mint,
      ticker: coin.ticker,
      name: coin.name,
      pageUrl: coinPageUrl(coin.mint),
      pumpUrl: coin.pumpUrl,
      graduatedAt: at,
      via,
      featured: false,
      note: 'External routine may post from @CrewPayHQ, then POST /api/coins/:mint/featured. CrewPay does not auto-post.',
    }).catch((err) => {
      console.warn('[graduation] webhook failed', err instanceof Error ? err.message : err)
    })
  }
  return { first, graduatedAt: first ? at : coin.graduatedAt || null, via: first ? via : coin.graduatedVia || null }
}
