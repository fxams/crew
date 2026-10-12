/**
 * Resolve the on-chain Pump bonding-curve creator for a mint.
 */

import { OnlinePumpSdk } from './agent/pump.js'
import { getConnection } from './agent/send.js'

export async function fetchPumpBondingCurveCreator(mint: string): Promise<string> {
  const online = new OnlinePumpSdk(getConnection())
  const curve = await online.fetchBondingCurve(mint)
  return curve.creator.toBase58()
}

/** https pump.fun URLs only (coin pages). Bags/Zora use isAllowedTradeHost instead. */
export function isValidPumpFunUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    const host = u.hostname.toLowerCase()
    return host === 'pump.fun' || host === 'www.pump.fun'
  } catch {
    return false
  }
}
