export const DEFAULT_API_URL = 'https://api.crewpay.dev'

/** Env var names only — never log values. */
export const API_KEY_ENV_NAMES = ['CREWPAY_API_KEY', 'CREW_AGENT_API_KEY'] as const

export type CrewPayPluginConfig = {
  apiUrl: string
  apiKey: string
  /** Which env var supplied the key, if any (name only). */
  apiKeySource?: string
}

export function loadCrewPayConfig(
  overrides: Partial<Pick<CrewPayPluginConfig, 'apiUrl' | 'apiKey'>> = {},
): CrewPayPluginConfig {
  const apiUrl = (
    overrides.apiUrl ||
    process.env.CREWPAY_API_URL?.trim() ||
    process.env.CREW_API_URL?.trim() ||
    DEFAULT_API_URL
  ).replace(/\/$/, '')

  let apiKey = overrides.apiKey?.trim() || ''
  let apiKeySource: string | undefined
  if (!apiKey) {
    for (const name of API_KEY_ENV_NAMES) {
      const v = process.env[name]?.trim()
      if (v) {
        apiKey = v
        apiKeySource = name
        break
      }
    }
  }

  return { apiUrl, apiKey, apiKeySource }
}

export function hasApiKey(cfg: CrewPayPluginConfig): boolean {
  return Boolean(cfg.apiKey)
}
