import type { Plugin } from './elizaos.js'
import { hireCrewAction } from './actions/hire-crew.js'
import { postBountyAction } from './actions/post-bounty.js'
import { postTaskAction } from './actions/post-task.js'
import { payAgentAction } from './actions/pay-agent.js'
import { checkStatusAction } from './actions/check-status.js'
import { launchCoinAction } from './actions/launch-coin.js'
import { crewpayStatusProvider } from './provider/crewpay-status.js'
import { API_KEY_ENV_NAMES } from './config.js'

export { CrewPayApiClient } from './client.js'
export { loadCrewPayConfig, API_KEY_ENV_NAMES } from './config.js'
export { resolveTaskEscrowBackend, JobsEscrowBackend } from './task-escrow.js'
export {
  hireCrewAction,
  postBountyAction,
  postTaskAction,
  payAgentAction,
  checkStatusAction,
  launchCoinAction,
}

export const crewpayPlugin: Plugin = {
  name: 'crewpay',
  description:
    'CrewPay — KOL autohire, escrowed jobs/bounties (test/devnet), non-custodial unsigned launch and payouts. Never auto-signs.',
  config: {
    CREWPAY_API_URL: process.env.CREWPAY_API_URL || process.env.CREW_API_URL || 'https://api.crewpay.dev',
    CREWPAY_API_KEY_ENV: API_KEY_ENV_NAMES[0],
  },
  actions: [
    hireCrewAction,
    postBountyAction,
    postTaskAction,
    payAgentAction,
    checkStatusAction,
    launchCoinAction,
  ],
  providers: [crewpayStatusProvider],
}

export default crewpayPlugin
