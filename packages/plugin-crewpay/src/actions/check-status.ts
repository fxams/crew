import type { Action } from '../elizaos.js'
import { actionFail, actionOk, getApiClient, parseActionPayload, requireApiKey } from '../utils.js'

export const checkStatusAction: Action = {
  name: 'CHECK_STATUS',
  similes: ['CREW_STATUS', 'CREWPAY_STATUS', 'MINT_STATUS', 'JOB_STATUS'],
  description:
    'Check CrewPay status: mint fee-share via jobId absent + mint set (GET /api/agent/status/:mint), or job in open list when jobId set. JSON: mint?, jobId?',
  validate: async (runtime) => requireApiKey(runtime),
  handler: async (runtime, message) => {
    try {
      const body = parseActionPayload(message)
      const api = getApiClient(runtime)
      const mint = typeof body.mint === 'string' ? body.mint.trim() : ''
      const jobId = typeof body.jobId === 'string' ? body.jobId.trim() : ''

      if (mint) {
        const status = await api.mintStatus(mint)
        return actionOk({ kind: 'mint', mint, status }, `Status for mint ${mint.slice(0, 8)}…`)
      }

      if (jobId) {
        const open = (await api.listOpenJobs()) as { jobs?: Array<{ id: string }> }
        const job = open.jobs?.find((j) => j.id === jobId)
        if (!job) {
          return actionOk(
            { kind: 'job', jobId, found: false, openCount: open.jobs?.length ?? 0 },
            'Job not in open list (may be closed or unfunded).',
          )
        }
        return actionOk({ kind: 'job', jobId, job }, 'Open job snapshot returned.')
      }

      const discovery = await api.discover()
      return actionOk({ kind: 'agent', discovery }, 'Agent discovery snapshot (no mint/jobId in payload).')
    } catch (e) {
      return actionFail(e)
    }
  },
}
