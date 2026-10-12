/**
 * Shared hire / unsigned-launch fulfillment.
 *
 * HTTP `/api/agent/autohire` + `/api/agent/launch/unsigned`, Virtuals ACP, and
 * the x402 path all call these functions. The paying agent wallet is identity
 * (who hired). Fee split is unchanged: 60% to the KOL crew, 15% to the launching
 * agent, 25% to the treasury.
 */
export { runAutohire, AUTOHIRE_DISCLAIMER, AUTOHIRE_SEATS_REQUEST_MAX } from './autohire-run.js'
export type { AutohireInput, AutohireResult, AutohireHire } from './autohire-run.js'
export { runUnsignedLaunch } from './unsigned-build.js'
export type { UnsignedLaunchInput, UnsignedLaunchResult } from './unsigned-build.js'
