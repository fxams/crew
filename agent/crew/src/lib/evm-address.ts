/** EVM (Base) payout address — 0x + 20 bytes hex. */
export const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/

export function isEvmAddress(value: string | null | undefined): boolean {
  return EVM_ADDRESS_RE.test(String(value || '').trim())
}

/** Empty input is valid (optional field). Non-empty must match EVM_ADDRESS_RE. */
export function evmAddressFieldError(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (isEvmAddress(trimmed)) return null
  if (!trimmed.startsWith('0x')) {
    return 'Base wallets start with 0x.'
  }
  if (trimmed.length < 42) {
    return 'Enter the full address (0x + 40 hex characters).'
  }
  return 'Invalid Base address — use 0x followed by 40 hex characters.'
}
