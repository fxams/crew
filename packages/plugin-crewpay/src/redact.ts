const SECRET_PATTERNS = [
  /crew_ak_[a-zA-Z0-9_-]+/gi,
  /x-launcher-key['":\s]+[^\s'"]+/gi,
  /CREW_LAUNCHER_KEY['":\s]+[^\s'"]+/gi,
]

/** Strip likely secrets from error text before returning to the model or logs. */
export function redactSecrets(text: string): string {
  let out = text
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, '[redacted]')
  }
  return out
}
