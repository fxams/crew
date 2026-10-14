import type { Action } from '../elizaos.js'
import { resolveTaskEscrowBackend } from '../task-escrow.js'
import { actionFail, actionOk, getApiClient, parseActionPayload, requireApiKey } from '../utils.js'

export const postBountyAction: Action = {
  name: 'POST_BOUNTY',
  similes: ['CREW_POST_BOUNTY', 'CREATE_BOUNTY', 'POST_CAMPAIGN'],
  description:
    'Create an escrowed bounty campaign (jobs + escrow). JSON: chainId, asset, budget, perProofAmount, maxProofs, deadlineHours|deadlineMs, rules. Optional fund:true, rail, from for devnet/sim funding.',
  validate: async (runtime) => requireApiKey(runtime),
  handler: async (runtime, message) => {
    try {
      const body = parseActionPayload(message)
      const fund = body.fund === true
      const rail = typeof body.rail === 'string' ? body.rail : undefined
      const from = typeof body.from === 'string' ? body.from : undefined
      const { fund: _f, rail: _r, from: _from, ...campaign } = body
      const escrow = resolveTaskEscrowBackend(getApiClient(runtime))
      const data = await escrow.postBounty(campaign, { fund, rail, from })
      return actionOk(data, fund ? 'Bounty created and funding attempted.' : 'Bounty created — fund escrow separately.')
    } catch (e) {
      return actionFail(e)
    }
  },
}
