export const REGISTER_KOL_TG_BOT_URL = 'https://crewpay.dev/register?src=tg_bot&tg=1'

export function normalizeRegisterSrc(raw: string | null | undefined): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 32)
}

export function registerPageQuery(opts: {
  ref?: string
  src?: string | null
  tg?: boolean
}): string {
  const q = new URLSearchParams()
  const src = opts.src ? normalizeRegisterSrc(opts.src) : ''
  if (src.length >= 2) q.set('src', src)
  if (opts.tg) q.set('tg', '1')
  const ref = (opts.ref || '').trim().replace(/^@+/, '').toLowerCase()
  if (ref.length >= 2) q.set('ref', ref.slice(0, 24))
  const s = q.toString()
  return s ? `?${s}` : ''
}
