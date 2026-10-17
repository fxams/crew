export function kolProgramEnabled(): boolean {
  const v = (process.env.KOL_PROGRAM_ENABLED || '').trim().toLowerCase()
  return v === '1' || v === 'true'
}

export const KOL_PROGRAM_FOUNDER_CAP = Number(process.env.KOL_PROGRAM_FOUNDER_CAP || 100)

export const CREWPAY_HQ_X_HANDLE = (
  process.env.CREWPAY_HQ_X_HANDLE || 'CrewPayHQ'
).replace(/^@+/, '')

/** Pinned @CrewPayHQ post id for onboarding + share reply intents. */
export function kolPinnedPostId(): string {
  return (process.env.KOL_PINNED_POST_ID || '').trim()
}

/** Share of indexed treasury fee receipts reserved for the KOL season pool (bps). Default 2000 = 20%. */
export const KOL_POOL_BPS = Math.min(
  10_000,
  Math.max(0, Number(process.env.KOL_POOL_BPS || 2000)),
)

/** Top N eligible KOLs by season points share the pool pro-rata. */
export const KOL_POOL_TOP_N = Math.min(200, Math.max(1, Number(process.env.KOL_POOL_TOP_N || 50)))
