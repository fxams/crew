import type { Action } from '../elizaos.js'
import { resolveTaskEscrowBackend } from '../task-escrow.js'
import { actionFail, actionOk, getApiClient, parseActionPayload, requireApiKey } from '../utils.js'

export const payAgentAction: Action = {
  name: 'PAY_AGENT',
  similes: ['CREW_PAY_AGENT', 'PAY_KOL', 'JOB_PAYOUT'],
  description:
    'Pay a verified claimant via jobs escrow rails (POST /api/jobs/:id/payout). Returns unsigned txs when non-custodial — never auto-signs. JSON: jobId, claimId?, from (payer wallet).',
  validate: async (runtime) => requireApiKey(runtime),
  handler: async (runtime, message) => {
    try {
      const body = parseActionPayload(message)
      const jobId = String(body.jobId || body.id || '')
      if (!jobId) {
        return actionFail(new Error('jobId is required'))
      }
      const claimId = typeof body.claimId === 'string' ? body.claimId : undefined
      const from = typeof body.from === 'string' ? body.from : undefined
      const escrow = resolveTaskEscrowBackend(getApiClient(runtime))
      const data = await escrow.payAgent(jobId, { claimId, from })
      return actionOk(
        data,
        'Payout prepared. If unsigned is present, sign and submit from your wallet — plugin does not sign.',
      )
    } catch (e) {
      return actionFail(e)
    }
  },
}
