/** Delivery-gated crew payouts + reputation-weighted crew shares (off by default). */

export function deliveryGatedPayoutsEnabled(): boolean {
  const v = (process.env.CREW_DELIVERY_GATED_PAYOUTS || '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'on'
}

/** Promo delivery window (hours after launch) — post must appear within this window. */
export function promoPostWindowHours(): number {
  const n = Number(process.env.CREW_PROMO_POST_WINDOW_HOURS || 72)
  if (!Number.isFinite(n) || n < 1) return 72
  return Math.min(336, Math.floor(n))
}

/** Re-check that the X post URL is still reachable after this many hours. */
export function promoStillLiveAfterHours(): number {
  const n = Number(process.env.CREW_PROMO_STILL_LIVE_HOURS || 6)
  if (!Number.isFinite(n) || n < 0) return 6
  return Math.min(72, Math.floor(n))
}

/** Minimum engagement score for promo auto-checks (mock-friendly; no live X API). */
export function promoMinEngagement(): number {
  const n = Number(process.env.CREW_PROMO_MIN_ENGAGEMENT || 3)
  if (!Number.isFinite(n) || n < 0) return 3
  return Math.min(10_000, Math.floor(n))
}
