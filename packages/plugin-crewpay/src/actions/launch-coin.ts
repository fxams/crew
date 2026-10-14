import type { Action } from '../elizaos.js'
import { actionFail, actionOk, getApiClient, parseActionPayload, requireApiKey } from '../utils.js'

export const launchCoinAction: Action = {
  name: 'LAUNCH_COIN',
  similes: ['CREW_BUILD_UNSIGNED', 'CREW_LAUNCH_UNSIGNED', 'BUILD_UNSIGNED_LAUNCH'],
  description:
    'Build UNSIGNED launch transactions only (POST /api/agent/launch/unsigned). Non-custodial — never auto-signs. Optional dryRunFirst:true runs launch dry-run first. Sign locally or use crew_submit_signed separately.',
  validate: async (runtime) => requireApiKey(runtime),
  handler: async (runtime, message) => {
    try {
      const body = parseActionPayload(message)
      const dryRunFirst = body.dryRunFirst === true
      const { dryRunFirst: _d, humanConfirmed: _h, confirmPhrase: _c, launcherKey: _lk, privateKey: _pk, secretKey: _sk, ...launchBody } =
        body

      if (body.launcherKey || body.privateKey || body.secretKey) {
        return actionFail(new Error('Never pass wallet secrets in action payloads — use env or local signing only.'))
      }

      const api = getApiClient(runtime)
      let dryRun: unknown
      if (dryRunFirst) {
        dryRun = await api.launchDryRun(launchBody)
      }
      const unsigned = await api.buildUnsignedLaunch(launchBody)
      return actionOk(
        { dryRun, unsigned, signedByPlugin: false },
        'Unsigned launch plan returned. Sign and submit from your wallet — this plugin never auto-signs.',
      )
    } catch (e) {
      return actionFail(e)
    }
  },
}
