/** Global daily lamport budget for server-paid ops (cranks). Per-process; UTC day. */

type DayBucket = { day: string; spent: number }

let bucket: DayBucket | null = null

function utcDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10)
}

export function opsDailyLamportsLimit(): number {
  const env = process.env.CREW_OPS_DAILY_LAMPORTS?.trim()
  if (!env) return 2_000_000
  const raw = Number(env)
  if (Number.isFinite(raw) && raw >= 0) return Math.floor(raw)
  return 2_000_000
}

/** Conservative fee estimate for a distribute/sweep crank (~1–2 sigs + priority). */
export const ESTIMATED_OPS_CRANK_LAMPORTS = 15_000

function ensureBucket(now = Date.now()): DayBucket {
  const day = utcDay(now)
  if (!bucket || bucket.day !== day) {
    bucket = { day, spent: 0 }
  }
  return bucket
}

export function opsBudgetRemaining(now = Date.now()): number {
  const b = ensureBucket(now)
  return Math.max(0, opsDailyLamportsLimit() - b.spent)
}

export function assertOpsBudget(lamports: number, now = Date.now()): void {
  const need = Math.max(0, Math.floor(lamports))
  const remaining = opsBudgetRemaining(now)
  if (need > remaining) {
    throw new Error(
      `Server ops daily lamport budget exhausted (${remaining} remaining of ${opsDailyLamportsLimit()}; need ${need}). Pass x-launcher-key or retry tomorrow (UTC).`,
    )
  }
}

export function drawOpsBudget(lamports: number, now = Date.now()): number {
  const b = ensureBucket(now)
  const add = Math.max(0, Math.floor(lamports))
  assertOpsBudget(add, now)
  b.spent += add
  return b.spent
}

/** Test helper */
export function resetOpsBudget() {
  bucket = null
}
