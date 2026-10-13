/** True when a Solana address can receive a payout (never send to empty). */
export function isPayoutWallet(value: string | null | undefined): boolean {
  const w = (value || '').trim()
  if (w.length < 32 || w.length > 64) return false
  if (w.startsWith('0x')) return false
  return true
}

