/**
 * @pump-fun/pump-sdk (and agent-payments-sdk) break under Node ESM named imports
 * (`BN` from @coral-xyz/anchor). Load via createRequire instead.
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pump = require('@pump-fun/pump-sdk') as typeof import('@pump-fun/pump-sdk')

export const OnlinePumpSdk = pump.OnlinePumpSdk
export const PumpSdk = pump.PumpSdk
export const getBuyTokenAmountFromSolAmount = pump.getBuyTokenAmountFromSolAmount
