export function jobsFeatureEnabled(): boolean {
  const v = (process.env.JOBS_ENABLED || '').trim().toLowerCase()
  return v === '1' || v === 'true'
}

export function jobsPlatformFeeBps(): number {
  const raw = (process.env.JOBS_PLATFORM_FEE_BPS || '').trim()
  const n = Number(raw)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(10_000, Math.floor(n)))
}

export function jobsPlatformFeeWallet(): string | null {
  const w = (process.env.JOBS_PLATFORM_FEE_WALLET || '').trim()
  return w || null
}

