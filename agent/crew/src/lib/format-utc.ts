/** Public clock times on crewpay.dev — always UTC, never the viewer’s local zone. */

function toUtcMs(input: string | number | Date): number | null {
  if (input instanceof Date) {
    const t = input.getTime()
    return Number.isFinite(t) ? t : null
  }
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null
    if (input >= 1e12) return input
    if (input >= 1e9) return input * 1000
    return null
  }
  const raw = String(input).trim()
  if (!raw) return null
  if (/^\d+$/.test(raw)) {
    const n = Number(raw)
    if (n >= 1e12) return n
    if (n >= 1e9) return n * 1000
    return null
  }
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? parsed : null
}

/** `YYYY-MM-DD HH:MM UTC` via UTC getters. */
export function formatUtc(input: string | number | Date | null | undefined): string {
  if (input == null || input === '') return '—'
  const ms = toUtcMs(input)
  if (ms == null) return '—'
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${y}-${mo}-${day} ${hh}:${mm} UTC`
}

/** Remaining time until an ISO / unix instant. Duration only — no zone. */
export function formatUtcCountdown(
  input: string | number | Date | null | undefined,
  now = Date.now(),
): string | null {
  const ms = input == null || input === '' ? null : toUtcMs(input)
  if (ms == null) return null
  const diff = ms - now
  if (diff <= 0) return null
  const d = Math.floor(diff / 86_400_000)
  const h = Math.floor((diff % 86_400_000) / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${Math.max(1, m)}m`
}

export function leaksNonUtcZone(text: string | null | undefined): boolean {
  if (!text) return false
  return /\bUTC\b|UTC|UTC|Z/i.test(text)
}
