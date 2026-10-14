import type { ActionResult, IAgentRuntime, Memory } from './elizaos.js'
import { loadCrewPayConfig, hasApiKey } from './config.js'
import { CrewPayApiClient } from './client.js'
import { redactSecrets } from './redact.js'

let cachedClient: CrewPayApiClient | null = null

export function getApiClient(runtime?: IAgentRuntime): CrewPayApiClient {
  if (runtime) {
    const settingStr = (key: string) => {
      const v = runtime.getSetting(key)
      return typeof v === 'string' ? v : undefined
    }
    const url = settingStr('CREWPAY_API_URL') || settingStr('CREW_API_URL')
    const key = settingStr('CREWPAY_API_KEY') || settingStr('CREW_AGENT_API_KEY')
    if (url || key) {
      return new CrewPayApiClient(loadCrewPayConfig({ apiUrl: url, apiKey: key }))
    }
  }
  if (!cachedClient) cachedClient = new CrewPayApiClient()
  return cachedClient
}

export function parseActionPayload(message: Memory): Record<string, unknown> {
  const text = (message.content?.text || '').trim()
  if (!text) return {}
  try {
    const parsed = JSON.parse(text) as unknown
    if (typeof parsed === 'object' && parsed && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // plain text — leave empty; handlers may use defaults
  }
  return {}
}

export function requireApiKey(runtime?: IAgentRuntime): boolean {
  const cfg = getApiClient(runtime).config
  return hasApiKey(cfg)
}

export function actionOk(data: unknown, text?: string): ActionResult {
  return {
    success: true,
    text: text || 'CrewPay action completed',
    data: typeof data === 'object' && data ? (data as Record<string, unknown>) : { result: data },
  }
}

export function actionFail(e: unknown): ActionResult {
  const msg = redactSecrets(e instanceof Error ? e.message : String(e))
  return { success: false, text: msg, error: msg }
}
