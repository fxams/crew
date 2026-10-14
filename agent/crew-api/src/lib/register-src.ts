/** Normalize signup attribution tags (e.g. tg_bot). Set once on first registration. */
export function normalizeRegisterSrc(raw: string | null | undefined): string | null {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 32)
  return s.length >= 2 ? s : null
}

export const TELEGRAM_REGISTER_KOL_URL = 'https://crewpay.dev/register?src=tg_bot&tg=1'
