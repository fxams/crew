import type { Action } from '../elizaos.js'
import { resolveTaskEscrowBackend } from '../task-escrow.js'
import { actionFail, actionOk, getApiClient, parseActionPayload, requireApiKey } from '../utils.js'

export const postTaskAction: Action = {
  name: 'POST_TASK',
  similes: ['CREW_POST_TASK', 'POST_COIN_JOB', 'CREW_POST_COIN_JOB'],
  description:
    'Post a coin creative task on jobs+escrow (meme-pack, banner-logo, x-upkeep, website-polish). Test/devnet chainIds only. JSON: mint, template, chainId, asset, budget, dryRun, fund.',
  validate: async (runtime) => requireApiKey(runtime),
  handler: async (runtime, message) => {
    try {
      const body = parseActionPayload(message)
      const dryRun = body.dryRun === true
      const fund = body.fund === true
      const { dryRun: _d, fund: _f, ...task } = body
      const escrow = resolveTaskEscrowBackend(getApiClient(runtime))
      const data = await escrow.postTask(task, { dryRun, fund })
      return actionOk(
        data,
        dryRun ? 'Task dry-run plan returned.' : 'Task posted on jobs+escrow (test/devnet).',
      )
    } catch (e) {
      return actionFail(e)
    }
  },
}
