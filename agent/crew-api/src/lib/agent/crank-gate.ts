import type { ApiCoin } from '../coins.js'

/**
 * Server-paid crank (CREW_OPS_KEY) is allowed only when the mint is on the
 * CrewPay board with a locked fee-share signature.
 */
export function canServerPayCrank(board: ApiCoin | null | undefined): boolean {
  return Boolean(board?.feeShareSignature)
}

export function serverPaidCrankDeniedMessage(): string {
  return 'x-launcher-key required — server-paid crank only for CrewPay board mints with feeShareSignature.'
}
