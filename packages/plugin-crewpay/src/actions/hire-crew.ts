import type { Action } from '../elizaos.js'
import { actionFail, actionOk, getApiClient, parseActionPayload, requireApiKey } from '../utils.js'

export const hireCrewAction: Action = {
  name: 'HIRE_CREW',
  similes: ['CREW_AUTOHIRE', 'CREWPAY_AUTOHIRE', 'AUTOHIRE_KOL'],
  description:
    'Preview or plan a KOL crew via CrewPay Autohire (POST /api/agent/autohire). No on-chain spend. Pass JSON: name, ticker, description, seats, crew[], etc.',
  validate: async (runtime) => requireApiKey(runtime),
  handler: async (runtime, message) => {
    try {
      const body = parseActionPayload(message)
      const data = await getApiClient(runtime).autohire(body)
      return actionOk(data, 'Autohire crew plan returned (preview only until launch).')
    } catch (e) {
      return actionFail(e)
    }
  },
}
