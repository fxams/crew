const SECRET_ENV = new Set([
  'ACP_SIGNER_KEY',
  'ACP_PRIVATE_KEY',
  'CREW_LAUNCHER_KEY',
  'CREW_AGENT_LAUNCHER_KEY',
  'CREW_BUYBACK_PRIVATE_KEY',
  'CREW_AGENT_API_KEY',
  'CREW_API_KEY',
])

const SECRET_KEY = /key|secret|private|signer|mnemonic|seed/i
const HEX_KEY = /\b(?:0x)?[a-fA-F0-9]{64}\b/g

export function redact(value: unknown): string {
  if (value == null) return ''
  let text = typeof value === 'string' ? value : safeJson(value)
  text = text.replace(HEX_KEY, '[redacted]')
  for (const name of SECRET_ENV) {
    const raw = process.env[name]
    if (raw && raw.length >= 8) {
      text = text.split(raw).join('[redacted]')
    }
  }
  return text
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, (key, v) => {
      if (SECRET_KEY.test(key)) return '[redacted]'
      if (typeof v === 'string' && HEX_KEY.test(v)) return '[redacted]'
      return v
    })
  } catch {
    return '[unserializable]'
  }
}

export function logInfo(message: string, extra?: unknown): void {
  if (extra === undefined) {
    console.log(`[acp-provider] ${redact(message)}`)
    return
  }
  console.log(`[acp-provider] ${redact(message)} ${redact(extra)}`)
}

export function logError(message: string, err?: unknown): void {
  const detail = err instanceof Error ? err.message : err
  console.error(`[acp-provider] ${redact(message)} ${redact(detail)}`)
}
