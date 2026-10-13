/** True when a Solana address can receive a payout (never send to empty). */
export function isPayoutWallet(value: string | null | undefined): boolean {
  const w = (value || '').trim()
  if (w.length < 32 || w.length > 64) return false
  if (w.startsWith('0x')) return false
  return true
}

export function vitePhantomAppId(): string {
  return (
    (import.meta.env.VITE_PHANTOM_APP_ID as string | undefined) ||
    (import.meta.env.VITE_PHANTOM_CONNECT_APP_ID as string | undefined) ||
    ''
  ).trim()
}

export function resolvePhantomAppId(fromApi?: string | null): string {
  return vitePhantomAppId() || (fromApi || '').trim()
}
