import type { Provider } from '../elizaos.js'
import { API_KEY_ENV_NAMES, hasApiKey, loadCrewPayConfig } from '../config.js'
import { CrewPayApiClient } from '../client.js'
import { redactSecrets } from '../redact.js'

export const crewpayStatusProvider: Provider = {
  name: 'CREWPAY_STATUS',
  description: 'CrewPay connectivity, API key presence (name only), and platform/discovery snapshot.',
  dynamic: true,
  position: 50,
  get: async (runtime) => {
    const settingStr = (key: string) => {
      const v = runtime.getSetting(key)
      return typeof v === 'string' ? v : undefined
    }
    const cfg = loadCrewPayConfig({
      apiUrl: settingStr('CREWPAY_API_URL') || settingStr('CREW_API_URL'),
      apiKey: settingStr('CREWPAY_API_KEY') || settingStr('CREW_AGENT_API_KEY'),
    })

    const values: Record<string, unknown> = {
      apiUrl: cfg.apiUrl,
      apiKeyConfigured: hasApiKey(cfg),
      apiKeyEnvNames: API_KEY_ENV_NAMES,
      apiKeySource: cfg.apiKeySource || (hasApiKey(cfg) ? 'runtime/settings or env' : null),
    }

    if (!hasApiKey(cfg)) {
      return {
        text: `CrewPay: API URL ${cfg.apiUrl}. No API key in env (${API_KEY_ENV_NAMES.join(', ')}). Claim via POST /api/agent/keys/claim.`,
        values,
      }
    }

    const api = new CrewPayApiClient(cfg)
    try {
      const [platforms, agent] = await Promise.all([
        api.platforms().catch(() => null),
        api.discover().catch(() => null),
      ])
      values.platforms = platforms
      values.agent = agent
      const feeNote =
        'Fee map default 60% KOL crew / 15% agent / 25% CrewPay. Buyback cron not live. Jobs+escrow: test/devnet when JOBS_ENABLED.'
      return {
        text: `CrewPay connected (${cfg.apiUrl}). API key present (${cfg.apiKeySource || 'env'}). ${feeNote}`,
        values,
        data: { platforms, agent },
      }
    } catch (e) {
      const msg = redactSecrets(e instanceof Error ? e.message : String(e))
      return {
        text: `CrewPay configured but status fetch failed: ${msg}`,
        values: { ...values, error: msg },
      }
    }
  },
}
